import { asc, cosineDistance, inArray, noteChunks, sql, type Database } from '@joice/db';
import type {
  ConverseClient,
  EmbeddingClient,
  GenerationClient,
  Usage,
} from '../providers/bedrock';
import type { ResolvedBrainConfig } from '../config/schemas';
import { buildSystemPrompt } from './prompt';
import { runToolLoop } from './agent-loop';
import {
  createThinkingStreamFilter,
  stripThinking,
  stripTrailingCitationClump,
} from './sanitize';
import { buildToolExecutors, type NotesPrefetch } from '../tools';
import { citedIndexes, stripCitationMarkers } from '../conversation/citations';
import { stubPorts, type BrainPorts } from '../ports';
import type {
  ChatAction,
  ChatMessage,
  Citation,
  PeptideRecommendation,
} from '../conversation/schemas';

/**
 * The brain's answer path — two modes, switched by the admin `toolsEnabled`
 * flag (the rollback lever: a settings change, not a deploy):
 *
 * CLASSIC (toolsEnabled=false): embed the question, retrieve the closest
 * chunks, and have the model answer strictly from them. Grounding is
 * structural — zero chunks above the floor means the model is never called.
 *
 * TOOLS (toolsEnabled=true): the model holds a toolbelt (search_notes,
 * search_catalogue, handoff/intent signals) and decides when to search. The
 * structural guarantee is replaced by a prescriptive safety floor (prompt.ts
 * TOOL_SAFETY_FLOOR) plus a provenance registry that makes it impossible to
 * cite anything a tool didn't return; the residual risk — uncited off-corpus
 * prose — is measured by the eval harness, which gates enabling the flag. A
 * speculative prefetch runs the classic condense→retrieve in parallel with
 * the first model call so the common case (first action is search_notes)
 * pays no extra latency.
 *
 * Behavior (persona, tone, guardrails, retrieval knobs, model, copy) comes
 * from the admin-managed brain config (`getConfig`, cached ~30s) — see
 * config/service.ts and prompt.ts. The safety floors live in code.
 */

export interface RetrievedChunk {
  sourcePath: string;
  headingPath: string | null;
  content: string;
  similarity: number;
  /** clinical_note | product_sheet | … — carried into citations for the UI. */
  sourceType?: string;
}

export type RecommendationStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; status: 'started' | 'finished'; ok: boolean; label: string }
  | { type: 'action'; action: ChatAction }
  | { type: 'complete'; recommendation: PeptideRecommendation; usage?: Usage };

/** Status-line copy per tool, mapped server-side so the client stays dumb. */
const TOOL_LABELS: Record<string, string> = {
  search_notes: 'Checking the research library…',
  search_catalogue: 'Checking the catalogue…',
  request_clinician_handoff: 'Looping in the clinical team…',
  flag_intent: '',
};

const CONDENSE_PROMPT =
  "Rewrite the user's last message as a single standalone search query about peptides, " +
  'supplements, or health protocols, resolving pronouns and references ("that", "it", ' +
  '"the second one") from the conversation. Keep it short and specific. ' +
  'Return ONLY the rewritten query — no quotes, no explanation.';

/** How much conversation the rewriter sees (turns / chars per turn). */
const CONDENSE_TURNS = 6;
const CONDENSE_TURN_CHARS = 500;

/**
 * Condense-question step: turn a context-dependent follow-up ("is there a
 * protocol for that?") into a standalone retrieval query using the
 * conversation. First questions pass through untouched (no LLM call), and any
 * failure falls back to the raw question — this step can only improve
 * retrieval, never break it. Generation always receives the ORIGINAL turns.
 */
export async function condenseQuestion(
  generation: GenerationClient,
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  const question = messages[messages.length - 1]!.content;
  if (messages.length === 1) return question;

  try {
    const transcript = messages
      .slice(-CONDENSE_TURNS)
      .map(
        (m) =>
          `${m.role === 'user' ? 'User' : 'Assistant'}: ${
            m.content.length > CONDENSE_TURN_CHARS
              ? `${m.content.slice(0, CONDENSE_TURN_CHARS)}…`
              : m.content
          }`,
      )
      .join('\n');

    const rewritten = (
      await generation.generate({
        model,
        maxTokens: 120,
        system: CONDENSE_PROMPT,
        turns: [
          {
            role: 'user',
            content: `Conversation:\n${transcript}\n\nStandalone search query for the last user message:`,
          },
        ],
      })
    ).trim();

    return rewritten.length > 0 && rewritten.length <= 300 ? rewritten : question;
  } catch (error) {
    // Fall back to the raw question — but say why, or failures are invisible.
    console.warn(
      `condenseQuestion: rewrite failed, using raw question (${(error as Error).message?.slice(0, 120)})`,
    );
    return question;
  }
}

export function createRecommendationService(
  db: Database,
  deps: {
    embeddings: EmbeddingClient;
    /** Tool mode needs the Converse surface; legacy stubs without it still work. */
    generation: GenerationClient & Partial<ConverseClient>;
    getConfig: () => Promise<ResolvedBrainConfig>;
    /** Catalogue (and later member context) adapters. Stubs by default. */
    ports?: BrainPorts;
  },
) {
  const { embeddings, generation, getConfig } = deps;
  const ports = deps.ports ?? stubPorts;

  async function retrieve(
    question: string,
    {
      topK,
      similarityFloor,
      sourceTypes,
    }: { topK: number; similarityFloor: number; sourceTypes?: string[] },
  ): Promise<RetrievedChunk[]> {
    const queryVector = await embeddings.embed(question);
    const distance = cosineDistance(noteChunks.embedding, queryVector);
    const similarity = sql<number>`1 - (${distance})`;

    const rows = await db
      .select({
        sourcePath: noteChunks.sourcePath,
        headingPath: noteChunks.headingPath,
        content: noteChunks.content,
        similarity,
        sourceType: noteChunks.sourceType,
      })
      .from(noteChunks)
      // One corpus, filtered by type when asked; undefined = no filter. Note:
      // pgvector applies this as a post-filter on the HNSW candidate set, so a
      // very selective type (few rows in a big corpus) can under-fill topK —
      // if that bites, tune hnsw.ef_search / enable iterative_scan (pgvector
      // ≥0.8) rather than reaching for a second index.
      .where(sourceTypes && sourceTypes.length > 0 ? inArray(noteChunks.sourceType, sourceTypes) : undefined)
      // Order by the raw distance, ascending. This must stay the bare operator
      // expression: `ORDER BY 1 - (a <=> b) DESC` is mathematically identical
      // but pgvector's HNSW index cannot serve it, so it fell back to scanning
      // every chunk (265ms over 31k rows, versus 20ms on the index). Similarity
      // stays as a projection, which is all the floor below needs.
      .orderBy(asc(distance))
      .limit(topK);

    return rows.filter((row) => row.similarity >= similarityFloor);
  }

  function buildRequest(
    config: ResolvedBrainConfig,
    messages: ChatMessage[],
    chunks: RetrievedChunk[],
  ) {
    const question = messages[messages.length - 1]!.content;
    const documents = chunks
      .map((chunk, i) => `[${i + 1}] ${documentTitle(chunk)}\n${chunk.content}`)
      .join('\n\n');

    // The citation reminder rides at the END of the user turn, not only in the
    // system prompt: smaller models (Nova) reliably drop the markers when the
    // instruction is buried above long documents, but honor it in this position.
    const citationReminder = config.showCitations
      ? '\n\n(Remember: cite each claim with the document number in square brackets, e.g. [1]. Never stack a row of citations at the end.)'
      : '';

    return {
      model: config.model,
      maxTokens: config.maxAnswerTokens,
      system: buildSystemPrompt(config),
      turns: [
        ...messages.slice(0, -1),
        {
          role: 'user' as const,
          content: `<documents>\n${documents}\n</documents>\n\n${question}${citationReminder}`,
        },
      ],
      // Classic mode's static prefix is small, so this rarely engages — but
      // the plumbing is shared and the provider degrades per-model anyway.
      promptCache: config.promptCache,
    };
  }

  function finalize(
    config: ResolvedBrainConfig,
    answer: string,
    chunks: RetrievedChunk[],
  ): PeptideRecommendation {
    // Model scaffolding never reaches a visitor: chain-of-thought blocks are
    // dropped, and a decorative row of citations stacked at the end goes too.
    const cleaned = stripTrailingCitationClump(stripThinking(answer));
    if (!config.showCitations) {
      // Defensive: strip any markers the model emitted despite instructions.
      return { answer: stripCitationMarkers(cleaned), citations: [] };
    }
    return { answer: cleaned.trim(), citations: parseCitations(cleaned, chunks) };
  }

  async function searchQuery(config: ResolvedBrainConfig, messages: ChatMessage[]) {
    return config.queryRewriting
      ? condenseQuestion(generation, config.rewriteModel, messages)
      : messages[messages.length - 1]!.content;
  }

  /** Can this instance run the tool path at all? (Legacy test stubs can't.) */
  function toolCapable(): boolean {
    return typeof generation.converseStream === 'function';
  }

  /**
   * The tool-mode answer. The provenance registry accumulates every chunk any
   * search_notes call returned, globally numbered — finalize() maps `[n]`
   * markers against it, so the model cannot mint a citation to something it
   * didn't retrieve (unknown indexes are dropped, exactly as in classic mode).
   */
  async function* toolStream(
    config: ResolvedBrainConfig,
    messages: ChatMessage[],
  ): AsyncGenerator<RecommendationStreamEvent> {
    const question = messages[messages.length - 1]!.content;
    const registry: RetrievedChunk[] = [];

    // Speculative prefetch: condense + retrieve, in parallel with the first
    // model call. If the model's first search matches (the common case), the
    // executor serves it at ~zero latency; errors just mean a fresh search.
    const prefetch: NotesPrefetch = {
      promise: (async () => {
        const query = await searchQuery(config, messages);
        return { query, chunks: await retrieve(query, config) };
      })().catch(() => null),
    };

    const executors = buildToolExecutors({
      retrieve,
      catalog: ports.catalog,
      config,
      registry,
      prefetch,
    });

    const citationReminder = config.showCitations
      ? '\n\n(Remember: cite each claim with the reference numbers from search_notes, e.g. [1]. Never stack a row of citations at the end.)'
      : '';

    const loop = runToolLoop({
      generation: generation as ConverseClient,
      request: {
        model: config.model,
        maxTokens: config.maxAnswerTokens,
        system: buildSystemPrompt(config, { tools: true }),
        turns: [
          ...messages.slice(0, -1),
          { role: 'user' as const, content: `${question}${citationReminder}` },
        ],
        tools: [...executors.values()].map((executor) => executor.spec),
        // System prompt + tool definitions are the stable prefix caching
        // exists for; iteration ≥2 of the loop re-sends all of it.
        promptCache: config.promptCache,
      },
      executors,
      maxRounds: config.maxToolRounds,
    });

    // Nova narrates its reasoning in <thinking> blocks, which stream as
    // ordinary text; the filter swallows them delta by delta, and finalize()
    // strips the authoritative text the same way, so both always agree.
    const thinkingFilter = createThinkingStreamFilter();

    for await (const event of loop) {
      if (event.type === 'delta') {
        const visible = thinkingFilter.push(event.text);
        if (visible) yield { type: 'delta', text: visible };
      } else if (event.type === 'tool') {
        yield { ...event, label: TOOL_LABELS[event.name] ?? '' };
      } else if (event.type === 'action') {
        yield event;
      } else {
        // A loop that produced no prose (rounds exhausted before an answer)
        // falls back to the honest not-covered copy, never an empty bubble.
        const recommendation =
          event.text.trim().length > 0
            ? finalize(config, event.text, registry)
            : { answer: config.notCoveredMessage, citations: [] };
        yield { type: 'complete', recommendation, usage: event.usage };
      }
    }
  }

  async function recommend(messages: ChatMessage[]): Promise<PeptideRecommendation> {
    const config = await getConfig();
    if (config.toolsEnabled && toolCapable()) {
      let recommendation: PeptideRecommendation = {
        answer: config.notCoveredMessage,
        citations: [],
      };
      for await (const event of toolStream(config, messages)) {
        if (event.type === 'complete') recommendation = event.recommendation;
      }
      return recommendation;
    }

    const question = await searchQuery(config, messages);
    const chunks = await retrieve(question, config);
    if (chunks.length === 0) return { answer: config.notCoveredMessage, citations: [] };

    const answer = await generation.generate(buildRequest(config, messages, chunks));
    return finalize(config, answer, chunks);
  }

  async function* recommendStream(
    messages: ChatMessage[],
  ): AsyncGenerator<RecommendationStreamEvent> {
    const config = await getConfig();
    if (config.toolsEnabled && toolCapable()) {
      yield* toolStream(config, messages);
      return;
    }

    const question = await searchQuery(config, messages);
    const chunks = await retrieve(question, config);
    if (chunks.length === 0) {
      yield { type: 'delta', text: config.notCoveredMessage };
      yield {
        type: 'complete',
        recommendation: { answer: config.notCoveredMessage, citations: [] },
      };
      return;
    }

    const thinkingFilter = createThinkingStreamFilter();
    for await (const event of generation.generateStream(buildRequest(config, messages, chunks))) {
      if (event.type === 'text') {
        const visible = thinkingFilter.push(event.text);
        if (visible) yield { type: 'delta', text: visible };
      } else {
        yield { type: 'complete', recommendation: finalize(config, event.text, chunks) };
      }
    }
  }

  return { retrieve, recommend, recommendStream };
}

export type RecommendationService = ReturnType<typeof createRecommendationService>;

function documentTitle(chunk: RetrievedChunk): string {
  return chunk.headingPath
    ? `${chunk.sourcePath} — ${chunk.headingPath}`
    : chunk.sourcePath;
}

/**
 * Collect the [n] markers the model actually used (in first-appearance order)
 * and map them back to the retrieved chunks. Markers pointing at documents
 * that weren't provided are ignored.
 */
export function parseCitations(answer: string, chunks: RetrievedChunk[]): Citation[] {
  const citations: Citation[] = [];
  for (const n of citedIndexes(answer)) {
    const chunk = chunks[n - 1];
    if (!chunk) continue;
    citations.push({
      index: n,
      sourcePath: chunk.sourcePath,
      headingPath: chunk.headingPath,
      citedText: chunk.content.length > 200 ? `${chunk.content.slice(0, 200)}…` : chunk.content,
      // Lets the UI render a product-sheet chip differently from a note chip.
      ...(chunk.sourceType ? { sourceType: chunk.sourceType } : {}),
    });
  }
  return citations;
}
