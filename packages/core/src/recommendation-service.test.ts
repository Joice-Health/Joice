import { describe, expect, test } from 'bun:test';
import type { Database } from '@joice/db';
import type { EmbeddingClient, GenerationClient, GenerationRequest } from './bedrock';
import {
  createRecommendationService,
  parseCitations,
  type RetrievedChunk,
} from './recommendation-service';

/** Stub covering the single select().from().orderBy().limit() chain retrieve() makes. */
function stubDb(rows: unknown[]) {
  const db = {
    select: () => ({
      from: () => ({
        orderBy: () => ({ limit: () => Promise.resolve(rows) }),
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

const chunk = (over: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
  sourcePath: 'peptides/bpc-157.md',
  headingPath: 'BPC-157 > Dosing',
  content: 'Typical protocols use 250-500mcg daily.',
  similarity: 0.8,
  ...over,
});

describe('recommend', () => {
  test('returns the not-covered answer without calling the model when nothing clears the floor', async () => {
    const calls: GenerationRequest[] = [];
    const service = createRecommendationService(stubDb([chunk({ similarity: 0.1 })]), {
      embeddings: stubEmbeddings,
      generation: stubGeneration('should never be used', calls),
      model: 'test-model',
    });

    const result = await service.recommend([{ role: 'user', content: 'What about kittens?' }]);
    expect(result.citations).toEqual([]);
    expect(result.answer).toContain("don't have information");
    expect(calls).toHaveLength(0);
  });

  test('numbers retrieved chunks into the prompt and keeps prior turns', async () => {
    const calls: GenerationRequest[] = [];
    const service = createRecommendationService(
      stubDb([chunk(), chunk({ sourcePath: 'peptides/tb-500.md', headingPath: 'TB-500' })]),
      {
        embeddings: stubEmbeddings,
        generation: stubGeneration('Answer.', calls),
        model: 'test-model',
      },
    );

    const messages = [
      { role: 'user' as const, content: 'Tell me about BPC-157' },
      { role: 'assistant' as const, content: 'It is a peptide.' },
      { role: 'user' as const, content: 'How is it dosed?' },
    ];
    await service.recommend(messages);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.model).toBe('test-model');
    expect(calls[0]!.turns).toHaveLength(3);
    expect(calls[0]!.turns.slice(0, 2)).toEqual(messages.slice(0, 2));

    const finalTurn = calls[0]!.turns[2]!;
    expect(finalTurn.role).toBe('user');
    expect(finalTurn.content).toContain('[1] peptides/bpc-157.md — BPC-157 > Dosing');
    expect(finalTurn.content).toContain('[2] peptides/tb-500.md — TB-500');
    expect(finalTurn.content).toContain('Typical protocols use 250-500mcg daily.');
    expect(finalTurn.content.endsWith('How is it dosed?')).toBe(true);
  });

  test('maps [n] markers in the answer back to citations', async () => {
    const service = createRecommendationService(stubDb([chunk()]), {
      embeddings: stubEmbeddings,
      generation: stubGeneration('Protocols use 250-500mcg daily [1].'),
      model: 'test-model',
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
});

describe('recommendStream', () => {
  test('yields deltas then the completion with parsed citations', async () => {
    const service = createRecommendationService(stubDb([chunk()]), {
      embeddings: stubEmbeddings,
      generation: stubGeneration('Streamed answer [1].'),
      model: 'test-model',
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
