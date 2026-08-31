import { z } from 'zod';
import type { RetrievedChunk } from '../generation/answer-service';
import { SOURCE_TYPES } from '../knowledge/sources';
import { invalidInput, type BrainTool } from './types';

/**
 * Loose token-overlap match, used to decide whether the speculative prefetch
 * answers the model's actual query. Overlap is measured against the smaller
 * set so a query that merely narrows the other still counts.
 */
export function similarQueries(a: string, b: string): boolean {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-z0-9-]+/)
        .filter((w) => w.length > 2),
    );
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.min(ta.size, tb.size) >= 0.5;
}

// The zod schema and spec.inputSchema below describe the same contract and
// move together: the spec is what the model is promised, the zod schema is
// what the executor enforces (the stream parser degrades malformed tool JSON
// to `{}`, so every executor validates its own input).
const searchNotesInput = z.object({
  query: z.string().trim().min(1).max(300),
  // An empty array is treated as "no filter" below rather than rejected — the
  // advertised JSON schema can't forbid it, so the model may legally send it.
  source_types: z.array(z.enum(SOURCE_TYPES)).optional(),
});

function documentTitle(chunk: RetrievedChunk): string {
  return chunk.headingPath ? `${chunk.sourcePath} — ${chunk.headingPath}` : chunk.sourcePath;
}

export const searchNotesTool: BrainTool = {
  label: 'Checking the research library…',
  spec: {
    name: 'search_notes',
    description:
      "Search Joice's clinical research library — the clinical team's notes on peptides, " +
      'supplements, dosing, protocols, and safety. You MUST call this before answering any ' +
      'question on those topics, with a short standalone search query (e.g. "BPC-157 oral ' +
      'dosing"). Results are numbered reference documents; cite claims with those numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Short standalone search query.' },
        source_types: {
          type: 'array',
          items: { type: 'string', enum: [...SOURCE_TYPES] },
          description:
            'Optional filter by document kind. Omit to search everything (usually right).',
        },
      },
      required: ['query'],
    },
  },
  create(deps) {
    // The prefetch is consulted once: it answers the first search (the common
    // case, at ~zero latency) or it doesn't; later searches are always fresh.
    let prefetch = deps.prefetch ?? null;

    return async (raw) => {
      const input = searchNotesInput.safeParse(raw);
      if (!input.success) {
        return invalidInput(
          `{ "query": string (1–300 chars), "source_types"?: array of ${SOURCE_TYPES.join(' | ')} }`,
        );
      }
      const { query } = input.data;
      const sourceTypes = input.data.source_types?.length ? input.data.source_types : undefined;

      let chunks: RetrievedChunk[] | null = null;
      // Claim the prefetch BEFORE awaiting: parallel same-round searches all
      // reach this line before any of them suspends, and claiming late would
      // serve the same chunks to both (duplicate registry entries, and one
      // query silently never searched). A type-filtered search skips it —
      // the prefetch searched everything.
      if (!sourceTypes) {
        const claimed = prefetch;
        prefetch = null;
        if (claimed) {
          const ready = await claimed.promise;
          if (ready && similarQueries(query, ready.query)) chunks = ready.chunks;
        }
      }
      chunks ??= await deps.retrieve(query, { ...deps.config, sourceTypes });

      if (chunks.length === 0) {
        return {
          resultText:
            'No notes matched this query. The library does not cover it — say so plainly ' +
            'rather than answering from general knowledge. If the phrasing was unusual, one ' +
            'retry with different terms is reasonable.',
        };
      }

      const start = deps.registry.length;
      deps.registry.push(...chunks);
      const documents = chunks
        .map((chunk, i) => `[${start + i + 1}] ${documentTitle(chunk)}\n${chunk.content}`)
        .join('\n\n');
      return {
        resultText: `Reference documents (cite claims with these numbers):\n\n${documents}`,
      };
    };
  },
};
