import { cosineDistance, noteChunks, sql, type Database } from '@joice/db';
import type { EmbeddingClient, GenerationClient } from './bedrock';
import type { ChatMessage, Citation, PeptideRecommendation } from './schemas';

/**
 * The RAG "brain": embed the member's question, retrieve the closest chunks of
 * the doctor's notes from pgvector, and have the model answer strictly from
 * those chunks, citing them with [n] markers. Grounding is enforced two ways:
 * the similarity floor short-circuits off-corpus questions before the model is
 * ever called, and the system prompt confines answers to the provided
 * documents.
 *
 * Citations are prompt-based (numbered documents + "[n]" markers parsed from
 * the answer) rather than Anthropic-native citation spans, so any Bedrock
 * chat model works — Claude in prod, Nova in dev.
 */

const TOP_K = 8;

/** Below this cosine similarity a chunk is noise, not evidence. */
const SIMILARITY_FLOOR = 0.4;

const NOT_COVERED_ANSWER =
  "I don't have information about that in our clinical reference notes, so I can't " +
  'give you a grounded answer. Try rephrasing, or ask about a specific peptide or ' +
  'protocol we cover.';

const SYSTEM_PROMPT = `You are Joice's peptide knowledge assistant. You answer members' questions using ONLY the numbered reference documents provided inside <documents> tags with each question — excerpts from our clinical team's notes.

Rules:
- Answer only from the provided documents. If they don't cover the question (or only partially cover it), say so plainly rather than filling gaps from general knowledge.
- Cite your sources: after each claim, add the number of the document it came from in square brackets, e.g. [1] or [2]. Only cite documents that actually support the claim.
- Be specific and practical; use plain language and keep answers focused.
- You provide educational information, not medical advice. Do not diagnose, prescribe, or tailor dosing to an individual. When a question calls for individual medical judgment, say that our clinical team handles that during consultation.
- Never invent sources, studies, or numbers that are not in the documents.`;

export interface RetrievedChunk {
  sourcePath: string;
  headingPath: string | null;
  content: string;
  similarity: number;
}

export type RecommendationStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'complete'; recommendation: PeptideRecommendation };

export function createRecommendationService(
  db: Database,
  deps: { embeddings: EmbeddingClient; generation: GenerationClient; model: string },
) {
  const { embeddings, generation, model } = deps;

  async function retrieve(question: string): Promise<RetrievedChunk[]> {
    const queryVector = await embeddings.embed(question);
    const similarity = sql<number>`1 - (${cosineDistance(noteChunks.embedding, queryVector)})`;

    const rows = await db
      .select({
        sourcePath: noteChunks.sourcePath,
        headingPath: noteChunks.headingPath,
        content: noteChunks.content,
        similarity,
      })
      .from(noteChunks)
      .orderBy(sql`${similarity} desc`)
      .limit(TOP_K);

    return rows.filter((row) => row.similarity >= SIMILARITY_FLOOR);
  }

  function buildRequest(messages: ChatMessage[], chunks: RetrievedChunk[]) {
    const question = messages[messages.length - 1]!.content;
    const documents = chunks
      .map((chunk, i) => `[${i + 1}] ${documentTitle(chunk)}\n${chunk.content}`)
      .join('\n\n');

    return {
      model,
      maxTokens: 1024,
      system: SYSTEM_PROMPT,
      turns: [
        ...messages.slice(0, -1),
        {
          role: 'user' as const,
          content: `<documents>\n${documents}\n</documents>\n\n${question}`,
        },
      ],
    };
  }

  async function recommend(messages: ChatMessage[]): Promise<PeptideRecommendation> {
    const question = messages[messages.length - 1]!.content;
    const chunks = await retrieve(question);
    if (chunks.length === 0) return { answer: NOT_COVERED_ANSWER, citations: [] };

    const answer = await generation.generate(buildRequest(messages, chunks));
    return { answer: answer.trim(), citations: parseCitations(answer, chunks) };
  }

  async function* recommendStream(
    messages: ChatMessage[],
  ): AsyncGenerator<RecommendationStreamEvent> {
    const question = messages[messages.length - 1]!.content;
    const chunks = await retrieve(question);
    if (chunks.length === 0) {
      yield { type: 'delta', text: NOT_COVERED_ANSWER };
      yield {
        type: 'complete',
        recommendation: { answer: NOT_COVERED_ANSWER, citations: [] },
      };
      return;
    }

    for await (const event of generation.generateStream(buildRequest(messages, chunks))) {
      if (event.type === 'text') {
        yield { type: 'delta', text: event.text };
      } else {
        yield {
          type: 'complete',
          recommendation: {
            answer: event.text.trim(),
            citations: parseCitations(event.text, chunks),
          },
        };
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
  const seen = new Set<number>();
  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const n = Number(match[1]);
    const chunk = chunks[n - 1];
    if (!chunk || seen.has(n)) continue;
    seen.add(n);
    citations.push({
      index: n,
      sourcePath: chunk.sourcePath,
      headingPath: chunk.headingPath,
      citedText: chunk.content.length > 200 ? `${chunk.content.slice(0, 200)}…` : chunk.content,
    });
  }
  return citations;
}
