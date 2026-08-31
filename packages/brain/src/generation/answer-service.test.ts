import { describe, expect, test } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { Database } from '@joice/db';
import { DEFAULT_BRAIN_SETTINGS, type ResolvedBrainConfig } from '../config/schemas';
import type {
  ConverseStreamEvent,
  EmbeddingClient,
  GenerationClient,
  GenerationRequest,
} from '../providers/bedrock';
import {
  condenseQuestion,
  createRecommendationService,
  parseCitations,
  type RetrievedChunk,
} from './answer-service';

/**
 * Stub covering the single select().from().orderBy().limit() chain retrieve()
 * makes. `captured.orderBy` records the ordering expression so a test can
 * assert it stayed index-usable — see the "retrieval ordering" suite.
 */
function stubDb(rows: unknown[], captured: { orderBy?: unknown; where?: unknown } = {}) {
  const db = {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          captured.where = condition;
          return {
            orderBy: (expr: unknown) => {
              captured.orderBy = expr;
              return { limit: () => Promise.resolve(rows) };
            },
          };
        },
      }),
    }),
  };
  return db as unknown as Database;
}

const stubEmbeddings: EmbeddingClient = {
  embed: async () => [0.1, 0.2, 0.3],
  embedBatch: async (texts) => texts.map(() => [0.1, 0.2, 0.3]),
};

function stubGeneration(answer: string, calls: GenerationRequest[] = []): GenerationClient {
  return {
    generate: async (request) => {
      calls.push(request);
      return answer;
    },
    generateStream: async function* (request) {
      calls.push(request);
      yield { type: 'text' as const, text: answer };
      yield { type: 'done' as const, text: answer };
    },
  };
}

const baseConfig: ResolvedBrainConfig = {
  ...DEFAULT_BRAIN_SETTINGS,
  model: 'test-model',
  pollyVoiceId: 'Ruth',
  // Most tests exercise retrieval/generation directly; rewriting has its own suite.
  queryRewriting: false,
};

const configOf = (over: Partial<ResolvedBrainConfig> = {}) =>
  async (): Promise<ResolvedBrainConfig> => ({ ...baseConfig, ...over });

const chunk = (over: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
  sourcePath: 'peptides/bpc-157.md',
  headingPath: 'BPC-157 > Dosing',
  content: 'Typical protocols use 250-500mcg daily.',
  similarity: 0.8,
  ...over,
});

describe('recommend', () => {
  test('uses the configured not-covered message without calling the model below the floor', async () => {
    const calls: GenerationRequest[] = [];
    const service = createRecommendationService(stubDb([chunk({ similarity: 0.1 })]), {
      embeddings: stubEmbeddings,
      generation: stubGeneration('never used', calls),
      getConfig: configOf({ notCoveredMessage: 'Custom fallback copy.' }),
    });

    const result = await service.recommend([{ role: 'user', content: 'What about kittens?' }]);
    expect(result).toEqual({ answer: 'Custom fallback copy.', citations: [] });
    expect(calls).toHaveLength(0);
  });

  test('config drives the similarity floor', async () => {
    const calls: GenerationRequest[] = [];
    const service = createRecommendationService(stubDb([chunk({ similarity: 0.3 })]), {
      embeddings: stubEmbeddings,
      generation: stubGeneration('Answer.', calls),
      getConfig: configOf({ similarityFloor: 0.2 }),
    });

    await service.recommend([{ role: 'user', content: 'Dosing?' }]);
    expect(calls).toHaveLength(1); // 0.3 clears the lowered floor
  });

  test('numbers chunks into the prompt and applies config model/tokens/prompt', async () => {
    const calls: GenerationRequest[] = [];
    const service = createRecommendationService(
      stubDb([chunk(), chunk({ sourcePath: 'peptides/tb-500.md', headingPath: 'TB-500' })]),
      {
        embeddings: stubEmbeddings,
        generation: stubGeneration('Answer.', calls),
        getConfig: configOf({ maxAnswerTokens: 512, personaName: 'Dot' }),
      },
    );

    const messages = [
      { role: 'user' as const, content: 'Tell me about BPC-157' },
      { role: 'assistant' as const, content: 'It is a peptide.' },
      { role: 'user' as const, content: 'How is it dosed?' },
    ];
    await service.recommend(messages);

    expect(calls[0]!.model).toBe('test-model');
    expect(calls[0]!.maxTokens).toBe(512);
    expect(calls[0]!.system).toContain('You are Dot');
    const finalTurn = calls[0]!.turns[2]!;
    expect(finalTurn.content).toContain('[1] peptides/bpc-157.md — BPC-157 > Dosing');
    expect(finalTurn.content).toContain('[2] peptides/tb-500.md — TB-500');
    expect(finalTurn.content).toContain('How is it dosed?');
    // Citation reminder rides at the end of the turn (highest salience).
    expect(finalTurn.content).toContain('square brackets');
  });

  test('maps [n] markers in the answer back to citations', async () => {
    const service = createRecommendationService(stubDb([chunk()]), {
      embeddings: stubEmbeddings,
      generation: stubGeneration('Protocols use 250-500mcg daily [1].'),
      getConfig: configOf(),
    });

    const result = await service.recommend([{ role: 'user', content: 'How is BPC dosed?' }]);
    expect(result.answer).toBe('Protocols use 250-500mcg daily [1].');
    expect(result.citations).toEqual([
      {
        index: 1,
        sourcePath: 'peptides/bpc-157.md',
        headingPath: 'BPC-157 > Dosing',
        citedText: 'Typical protocols use 250-500mcg daily.',
      },
    ]);
  });

  test('showCitations=false strips stray markers and returns no citations', async () => {
    const service = createRecommendationService(stubDb([chunk()]), {
      embeddings: stubEmbeddings,
      generation: stubGeneration('Protocols use 250-500mcg daily [1]. Take with food [1, 2].'),
      getConfig: configOf({ showCitations: false }),
    });

    const result = await service.recommend([{ role: 'user', content: 'Dosing?' }]);
    // No space stranded before the period, and grouped markers go too — the
    // old stripper matched only [1] and left " ." behind.
    expect(result.answer).toBe('Protocols use 250-500mcg daily. Take with food.');
    expect(result.citations).toEqual([]);
  });
});

describe('recommendStream', () => {
  test('yields deltas then the completion with parsed citations', async () => {
    const service = createRecommendationService(stubDb([chunk()]), {
      embeddings: stubEmbeddings,
      generation: stubGeneration('Streamed answer [1].'),
      getConfig: configOf(),
    });

    const events = [];
    for await (const event of service.recommendStream([{ role: 'user', content: 'Dosing?' }])) {
      events.push(event);
    }

    expect(events[0]).toEqual({ type: 'delta', text: 'Streamed answer [1].' });
    const complete = events.at(-1)!;
    expect(complete.type).toBe('complete');
    if (complete.type === 'complete') {
      expect(complete.recommendation.answer).toBe('Streamed answer [1].');
      expect(complete.recommendation.citations).toHaveLength(1);
    }
  });
});

describe('condenseQuestion', () => {
  const history = [
    { role: 'user' as const, content: 'Tell me about tirzepatide' },
    { role: 'assistant' as const, content: 'Tirzepatide is a dual GIP/GLP-1 agonist…' },
    { role: 'user' as const, content: 'is there a protocol for that?' },
  ];

  test('first questions pass through without an LLM call', async () => {
    const calls: GenerationRequest[] = [];
    const result = await condenseQuestion(stubGeneration('never', calls), 'rw-model', [
      { role: 'user', content: 'Tell me about tirzepatide' },
    ]);
    expect(result).toBe('Tell me about tirzepatide');
    expect(calls).toHaveLength(0);
  });

  test('follow-ups are rewritten with the rewrite model and full context', async () => {
    const calls: GenerationRequest[] = [];
    const result = await condenseQuestion(
      stubGeneration('tirzepatide dosing protocol', calls),
      'rw-model',
      history,
    );
    expect(result).toBe('tirzepatide dosing protocol');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.model).toBe('rw-model');
    expect(calls[0]!.turns[0]!.content).toContain('Tell me about tirzepatide');
    expect(calls[0]!.turns[0]!.content).toContain('is there a protocol for that?');
  });

  test('falls back to the raw question on failure or junk output', async () => {
    const throwing: GenerationClient = {
      generate: async () => {
        throw new Error('boom');
      },
      generateStream: async function* () {
        yield { type: 'done' as const, text: '' };
      },
    };
    expect(await condenseQuestion(throwing, 'rw', history)).toBe('is there a protocol for that?');
    expect(await condenseQuestion(stubGeneration(''), 'rw', history)).toBe(
      'is there a protocol for that?',
    );
    expect(await condenseQuestion(stubGeneration('x'.repeat(400)), 'rw', history)).toBe(
      'is there a protocol for that?',
    );
  });
});

describe('query rewriting in recommend', () => {
  test('the rewritten query is what gets embedded; generation still sees original turns', async () => {
    const embedded: string[] = [];
    const spyEmbeddings: EmbeddingClient = {
      embed: async (text) => {
        embedded.push(text);
        return [0.1, 0.2, 0.3];
      },
      embedBatch: async (texts) => texts.map(() => [0.1, 0.2, 0.3]),
    };
    // First generate() call is the rewrite; second is the answer.
    const calls: GenerationRequest[] = [];
    let generateCount = 0;
    const generation: GenerationClient = {
      generate: async (request) => {
        calls.push(request);
        return ++generateCount === 1 ? 'tirzepatide protocol' : 'Answer [1].';
      },
      generateStream: async function* () {
        yield { type: 'done' as const, text: '' };
      },
    };

    const service = createRecommendationService(stubDb([chunk()]), {
      embeddings: spyEmbeddings,
      generation,
      getConfig: configOf({ queryRewriting: true, rewriteModel: 'rw-model' }),
    });

    const messages = [
      { role: 'user' as const, content: 'Tell me about tirzepatide' },
      { role: 'assistant' as const, content: 'It is a dual agonist.' },
      { role: 'user' as const, content: 'is there a protocol for that?' },
    ];
    const result = await service.recommend(messages);

    expect(embedded).toEqual(['tirzepatide protocol']); // rewritten, not the raw follow-up
    expect(calls[0]!.model).toBe('rw-model');
    expect(calls[1]!.model).toBe('test-model');
    expect(calls[1]!.turns[0]).toEqual(messages[0]); // original conversation preserved
    expect(result.answer).toBe('Answer [1].');
  });

  test('queryRewriting=false embeds the raw follow-up', async () => {
    const embedded: string[] = [];
    const spyEmbeddings: EmbeddingClient = {
      embed: async (text) => {
        embedded.push(text);
        return [0.1, 0.2, 0.3];
      },
      embedBatch: async (texts) => texts.map(() => [0.1, 0.2, 0.3]),
    };
    const service = createRecommendationService(stubDb([chunk()]), {
      embeddings: spyEmbeddings,
      generation: stubGeneration('Answer.'),
      getConfig: configOf({ queryRewriting: false }),
    });

    await service.recommend([
      { role: 'user', content: 'Tell me about tirzepatide' },
      { role: 'assistant', content: 'It is a dual agonist.' },
      { role: 'user', content: 'is there a protocol for that?' },
    ]);
    expect(embedded).toEqual(['is there a protocol for that?']);
  });
});

describe('parseCitations', () => {
  const chunks = [chunk(), chunk({ sourcePath: 'peptides/tb-500.md', headingPath: 'TB-500' })];

  test('collects markers in first-appearance order and dedupes repeats', () => {
    const citations = parseCitations('First [2]. Second [1][2].', chunks);
    expect(citations.map((c) => [c.index, c.sourcePath])).toEqual([
      [2, 'peptides/tb-500.md'],
      [1, 'peptides/bpc-157.md'],
    ]);
  });

  test('ignores markers pointing at unknown documents', () => {
    expect(parseCitations('Claim [9]. Zero [0].', chunks)).toEqual([]);
  });

  test('truncates long cited text to a 200-char snippet', () => {
    const long = chunk({ content: 'x'.repeat(300) });
    const citations = parseCitations('Claim [1].', [long]);
    expect(citations[0]!.citedText).toHaveLength(201); // 200 chars + ellipsis
    expect(citations[0]!.citedText.endsWith('…')).toBe(true);
  });
});

describe('retrieval ordering', () => {
  /**
   * The one property that decides whether every question costs 20ms or 265ms.
   * pgvector's HNSW index can only serve an ORDER BY that is the bare distance
   * operator; `ORDER BY 1 - (a <=> b) DESC` returns the identical rows in the
   * identical order and silently falls back to scanning the whole corpus.
   * Nothing about the answers changes, which is exactly why this needs a test.
   */
  test('orders by the raw distance operator, so the HNSW index applies', async () => {
    const captured: { orderBy?: unknown } = {};
    const service = createRecommendationService(stubDb([chunk()], captured), {
      embeddings: stubEmbeddings,
      generation: stubGeneration('An answer [1].'),
      getConfig: configOf(),
    });
    await service.recommend([{ role: 'user', content: 'bpc-157 dosing' }]);

    const rendered = new PgDialect().sqlToQuery(captured.orderBy as SQL).sql;
    expect(rendered).toBe('"note_chunks"."embedding" <=> $1 asc');
    // Guard the specific regression rather than only the happy shape.
    expect(rendered).not.toContain('1 -');
    expect(rendered).not.toContain('desc');
  });
});

describe('tools mode (toolsEnabled=true)', () => {
  type ConverseEvents = ConverseStreamEvent[];

  /** Legacy stub + a scripted Converse surface: call N replays sequence N. */
  function toolGeneration(calls: ConverseEvents[], capture: GenerationRequest[] = []) {
    let call = 0;
    return {
      ...stubGeneration('legacy path should not run'),
      converse: () => Promise.reject(new Error('not used')),
       
      converseStream: async function* (request: GenerationRequest) {
        capture.push(request);
        const events = calls[call]!;
        call += 1;
        yield* events;
      },
    };
  }

  const searchThenAnswer = (query: string, answer: string): ConverseEvents[] => [
    [
      { type: 'toolUseStart', toolUseId: 'tu_1', name: 'search_notes' },
      {
        type: 'done',
        result: {
          stopReason: 'tool_use',
          blocks: [{ type: 'toolUse', toolUseId: 'tu_1', name: 'search_notes', input: { query } }],
          text: '',
          usage: { inputTokens: 200, outputTokens: 30 },
        },
      },
    ],
    [
      { type: 'text', text: answer },
      {
        type: 'done',
        result: {
          stopReason: 'end_turn',
          blocks: [{ type: 'text', text: answer }],
          text: answer,
          usage: { inputTokens: 400, outputTokens: 80 },
        },
      },
    ],
  ];

  test('search → answer: citations map against the provenance registry, usage accumulates', async () => {
    const capture: GenerationRequest[] = [];
    const service = createRecommendationService(stubDb([chunk()]), {
      embeddings: stubEmbeddings,
      generation: toolGeneration(searchThenAnswer('bpc dosing', 'Dosed at 250-500mcg [1].'), capture),
      getConfig: configOf({ toolsEnabled: true }),
    });

    const events = [];
    for await (const event of service.recommendStream([{ role: 'user', content: 'bpc dosing?' }])) {
      events.push(event);
    }

    const tools = events.filter((e) => e.type === 'tool');
    expect(tools[0]).toMatchObject({ name: 'search_notes', status: 'started', label: 'Checking the research library…' });
    const complete = events.at(-1)!;
    if (complete.type !== 'complete') throw new Error('expected complete');
    expect(complete.recommendation.answer).toBe('Dosed at 250-500mcg [1].');
    expect(complete.recommendation.citations).toHaveLength(1);
    expect(complete.recommendation.citations[0]!.sourcePath).toBe('peptides/bpc-157.md');
    expect(complete.usage).toEqual({ inputTokens: 600, outputTokens: 110 });

    // The request carried the toolbelt and the tools-mode floor.
    expect(capture[0]!.tools!.map((t) => t.name)).toContain('search_catalogue');
    expect(capture[0]!.system).toContain('MUST call the search_notes tool');
  });

  test('the tools-used trace rides the finished answer', async () => {
    const service = createRecommendationService(stubDb([chunk()]), {
      embeddings: stubEmbeddings,
      generation: toolGeneration(searchThenAnswer('bpc dosing', 'Dosed at 250-500mcg [1].')),
      getConfig: configOf({ toolsEnabled: true }),
    });

    const result = await service.recommend([{ role: 'user', content: 'bpc dosing?' }]);
    expect(result.toolsUsed).toEqual([
      { name: 'search_notes', label: 'Checking the research library…' },
    ]);
  });

  test('showToolActivity=false: no tool events on the wire, no trace on the answer', async () => {
    const service = createRecommendationService(stubDb([chunk()]), {
      embeddings: stubEmbeddings,
      generation: toolGeneration(searchThenAnswer('bpc dosing', 'Dosed at 250-500mcg [1].')),
      getConfig: configOf({ toolsEnabled: true, showToolActivity: false }),
    });

    const events = [];
    for await (const event of service.recommendStream([{ role: 'user', content: 'bpc dosing?' }])) {
      events.push(event);
    }

    // The gate is server-side and total: nothing tool-shaped reaches the wire.
    expect(events.filter((e) => e.type === 'tool')).toHaveLength(0);
    const complete = events.at(-1)!;
    if (complete.type !== 'complete') throw new Error('expected complete');
    expect(complete.recommendation.toolsUsed).toBeUndefined();
    // The answer itself is untouched by the toggle.
    expect(complete.recommendation.answer).toBe('Dosed at 250-500mcg [1].');
    expect(complete.recommendation.citations).toHaveLength(1);
  });

  test('a loop that ends with no prose falls back to the not-covered copy', async () => {
    const service = createRecommendationService(stubDb([chunk()]), {
      embeddings: stubEmbeddings,
      generation: toolGeneration([
        [
          {
            type: 'done',
            result: { stopReason: 'end_turn', blocks: [], text: '', usage: { inputTokens: 10, outputTokens: 0 } },
          },
        ],
      ]),
      getConfig: configOf({ toolsEnabled: true, notCoveredMessage: 'Nothing on that.' }),
    });

    const result = await service.recommend([{ role: 'user', content: 'hm?' }]);
    expect(result).toEqual({ answer: 'Nothing on that.', citations: [] });
  });

  test('toolsEnabled with a legacy-only client falls back to the classic pipeline', async () => {
    const calls: GenerationRequest[] = [];
    const service = createRecommendationService(stubDb([chunk()]), {
      embeddings: stubEmbeddings,
      generation: stubGeneration('Classic answer [1].', calls),
      getConfig: configOf({ toolsEnabled: true }),
    });

    const result = await service.recommend([{ role: 'user', content: 'bpc dosing?' }]);
    expect(result.answer).toBe('Classic answer [1].');
    expect(calls[0]!.turns.at(-1)!.content).toContain('<documents>'); // classic prompt shape
  });

  test('toolsEnabled=false never touches the Converse surface', async () => {
    const capture: GenerationRequest[] = [];
    const generation = {
      ...stubGeneration('Classic.'),
      converse: () => Promise.reject(new Error('must not be called')),
      converseStream: async function* (): AsyncGenerator<ConverseStreamEvent> {
        throw new Error('must not be called');
         
        yield undefined as never;
      },
    };
    const service = createRecommendationService(stubDb([chunk()]), {
      embeddings: stubEmbeddings,
      generation,
      getConfig: configOf({ toolsEnabled: false }),
    });
    const result = await service.recommend([{ role: 'user', content: 'bpc?' }]);
    expect(result.answer).toBe('Classic.');
    expect(capture).toHaveLength(0);
  });
});

describe('retrieval source-type filter', () => {
  test('sourceTypes becomes a WHERE on source_type; omitting it leaves retrieval unfiltered', async () => {
    const captured: { where?: unknown } = {};
    const service = createRecommendationService(stubDb([chunk()], captured), {
      embeddings: stubEmbeddings,
      generation: stubGeneration('unused'),
      getConfig: configOf(),
    });

    await service.retrieve('sleep aids', {
      topK: 8,
      similarityFloor: 0.4,
      sourceTypes: ['product_sheet', 'faq'],
    });
    const rendered = new PgDialect().sqlToQuery(captured.where as SQL).sql;
    expect(rendered).toContain('"note_chunks"."source_type" in (');

    await service.retrieve('sleep aids', { topK: 8, similarityFloor: 0.4 });
    expect(captured.where).toBeUndefined();
  });
});

describe('citation source types', () => {
  test('a chunk that knows its source type carries it into the citation; others stay unchanged', () => {
    const typed = chunk({ sourceType: 'product_sheet' });
    const untyped = chunk({ sourcePath: 'peptides/tb-500.md', headingPath: 'TB-500' });
    const citations = parseCitations('A [1]. B [2].', [typed, untyped]);
    expect(citations[0]!.sourceType).toBe('product_sheet');
    expect('sourceType' in citations[1]!).toBe(false);
  });
});

describe('prompt caching plumb-through', () => {
  test('config.promptCache rides into the generation request on the classic path', async () => {
    const calls: GenerationRequest[] = [];
    const service = createRecommendationService(stubDb([chunk()]), {
      embeddings: stubEmbeddings,
      generation: stubGeneration('Answer.', calls),
      getConfig: configOf({ promptCache: true }),
    });
    await service.recommend([{ role: 'user', content: 'Dosing?' }]);
    expect(calls[0]!.promptCache).toBe(true);
  });
});
