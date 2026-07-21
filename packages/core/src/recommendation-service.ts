import { asc, cosineDistance, noteChunks, sql, type Database } from '@joice/db';
import type { EmbeddingClient, GenerationClient } from './bedrock';
import type { ResolvedBrainConfig } from './admin/schemas';
import { buildSystemPrompt } from './prompt';
import { citedIndexes, stripCitationMarkers } from './citations';
import type { ChatMessage, Citation, PeptideRecommendation } from './schemas';

/**
 * The RAG "brain": embed the member's question, retrieve the closest chunks of
 * the doctor's notes from pgvector, and have the model answer strictly from
 * those chunks, citing them with [n] markers. Grounding is enforced two ways:
 * the similarity floor short-circuits off-corpus questions before the model is
 * ever called, and the system prompt confines answers to the provided
 * documents.
 *
 * Behavior (persona, tone, guardrails, retrieval knobs, model, copy) comes
 * from the admin-managed brain config (`getConfig`, cached ~30s) — see
 * brain-config.ts and prompt.ts. The safety floor lives in prompt.ts and is
 * not configurable.
 */

export interface RetrievedChunk {
  sourcePath: string;
  headingPath: string | null;
  content: string;
  similarity: number;
}

export type RecommendationStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'complete'; recommendation: PeptideRecommendation };

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
    generation: GenerationClient;
    getConfig: () => Promise<ResolvedBrainConfig>;
  },
) {
  const { embeddings, generation, getConfig } = deps;

  async function retrieve(
    question: string,
    { topK, similarityFloor }: { topK: number; similarityFloor: number },
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
      })
      .from(noteChunks)
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
      ? '\n\n(Remember: cite each claim with the document number in square brackets, e.g. [1].)'
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
    };
  }

  function finalize(
    config: ResolvedBrainConfig,
    answer: string,
    chunks: RetrievedChunk[],
  ): PeptideRecommendation {
    if (!config.showCitations) {
      // Defensive: strip any markers the model emitted despite instructions.
      return { answer: stripCitationMarkers(answer), citations: [] };
    }
    return { answer: answer.trim(), citations: parseCitations(answer, chunks) };
  }

  async function searchQuery(config: ResolvedBrainConfig, messages: ChatMessage[]) {
    return config.queryRewriting
      ? condenseQuestion(generation, config.rewriteModel, messages)
      : messages[messages.length - 1]!.content;
  }

  async function recommend(messages: ChatMessage[]): Promise<PeptideRecommendation> {
    const config = await getConfig();
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

    for await (const event of generation.generateStream(buildRequest(config, messages, chunks))) {
      if (event.type === 'text') {
        yield { type: 'delta', text: event.text };
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
    });
  }
  return citations;
}
