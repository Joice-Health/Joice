import { z } from 'zod';
import type { ToolExecutor, ToolOutcome } from '../generation/agent-loop';
import type { RetrievedChunk } from '../generation/answer-service';
import type { CatalogPort } from '../ports';
import { HANDOFF_REASONS, INTENT_KINDS } from '../conversation/schemas';

/**
 * The companion's toolbelt. Executors are built per-request as closures over
 * that request's citation registry and speculative prefetch — nothing here is
 * shared between requests.
 *
 * Design rules:
 * - Read-only or signal-only. Nothing in this file writes anywhere. Anything
 *   that changes the world (cart, later) is propose-confirm: the tool can only
 *   draw a card; a plain endpoint the model can't reach executes the click.
 * - Every executor validates its own input (the stream parser degrades
 *   malformed tool JSON to `{}`) and answers a mismatch with `isError` so the
 *   model can recover instead of the request dying.
 * - Descriptions carry the trigger conditions ("call this when…") — Nova
 *   follows prescriptive descriptions far more reliably than implied ones.
 */

export interface NotesPrefetch {
  /** Resolves with the condensed query and its results, or null on any failure. */
  promise: Promise<{ query: string; chunks: RetrievedChunk[] } | null>;
}

export interface ToolDeps {
  retrieve: (
    query: string,
    opts: { topK: number; similarityFloor: number },
  ) => Promise<RetrievedChunk[]>;
  catalog: CatalogPort;
  config: { topK: number; similarityFloor: number };
  /**
   * The request's provenance registry. search_notes appends every chunk it
   * returns, and numbers its results against the registry's global index —
   * which is why a citation can only ever point at something actually
   * retrieved this request.
   */
  registry: RetrievedChunk[];
  prefetch?: NotesPrefetch;
}

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

const searchNotesInput = z.object({ query: z.string().trim().min(1).max(300) });
const searchCatalogueInput = z.object({ query: z.string().trim().min(1).max(200) });
const handoffInput = z.object({ reason: z.enum(HANDOFF_REASONS) });
const intentInput = z.object({ intent: z.enum(INTENT_KINDS) });

const CATALOGUE_LIMIT = 5;

function invalidInput(expected: string): ToolOutcome {
  return { resultText: `Invalid input — expected ${expected}.`, isError: true };
}

function documentTitle(chunk: RetrievedChunk): string {
  return chunk.headingPath ? `${chunk.sourcePath} — ${chunk.headingPath}` : chunk.sourcePath;
}

export function buildToolExecutors(deps: ToolDeps): Map<string, ToolExecutor> {
  // The prefetch is consulted once: it answers the first search (the common
  // case, at ~zero latency) or it doesn't; later searches are always fresh.
  let prefetch = deps.prefetch ?? null;

  const searchNotes: ToolExecutor = {
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
        },
        required: ['query'],
      },
    },
    async execute(raw) {
      const input = searchNotesInput.safeParse(raw);
      if (!input.success) return invalidInput('{ "query": string } (1–300 characters)');
      const query = input.data.query;

      let chunks: RetrievedChunk[] | null = null;
      // Claim the prefetch BEFORE awaiting: parallel same-round searches all
      // reach this line before any of them suspends, and claiming late would
      // serve the same chunks to both (duplicate registry entries, and one
      // query silently never searched).
      const claimed = prefetch;
      prefetch = null;
      if (claimed) {
        const ready = await claimed.promise;
        if (ready && similarQueries(query, ready.query)) chunks = ready.chunks;
      }
      chunks ??= await deps.retrieve(query, deps.config);

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
    },
  };

  const searchCatalogue: ToolExecutor = {
    spec: {
      name: 'search_catalogue',
      description:
        'Search the Joice product catalogue for what Joice sells and current availability. ' +
        'Call this when the member asks what products exist, what something costs, or whether ' +
        'it can be ordered. Never state or invent product facts without calling it.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Product name or theme, e.g. "sleep".' },
        },
        required: ['query'],
      },
    },
    async execute(raw) {
      const input = searchCatalogueInput.safeParse(raw);
      if (!input.success) return invalidInput('{ "query": string }');
      const items = await deps.catalog.search(input.data.query, CATALOGUE_LIMIT);
      if (items.length === 0) {
        return {
          resultText:
            'The catalogue has no matching products — it is not open for orders yet. Do not ' +
            'invent products. If the member wants to get going, the "start your journey" path ' +
            'is open today.',
        };
      }
      return {
        resultText: `Products:\n${items
          .map((item) => `- ${item.name} (${item.available ? 'available' : 'not currently available'})`)
          .join('\n')}`,
      };
    },
  };

  const clinicianHandoff: ToolExecutor = {
    spec: {
      name: 'request_clinician_handoff',
      description:
        "Show the member a card to connect with Joice's licensed clinical team. Call this when " +
        'a question needs individual medical judgment — dosing for their specific situation, ' +
        'their symptoms or conditions, interactions with their medications — or when they ask ' +
        'to talk to a person. Pick the closest reason.',
      inputSchema: {
        type: 'object',
        properties: { reason: { type: 'string', enum: [...HANDOFF_REASONS] } },
        required: ['reason'],
      },
    },
    async execute(raw) {
      const input = handoffInput.safeParse(raw);
      if (!input.success) return invalidInput(`{ "reason": one of ${HANDOFF_REASONS.join(' | ')} }`);
      return {
        resultText:
          'The member has been shown a card to connect with the clinical team. Give a brief ' +
          'grounded answer if the documents support one, and defer the individual specifics ' +
          'to the team.',
        action: { kind: 'handoff', reason: input.data.reason },
      };
    },
  };

  const flagIntent: ToolExecutor = {
    spec: {
      name: 'flag_intent',
      description:
        'Signal that the member sounds ready to start with Joice (asking how to sign up, join, ' +
        'begin, or about membership). This only nudges the interface to offer the next step at ' +
        'the right moment — it stores nothing and shows nothing by itself. Keep answering ' +
        'normally after calling it.',
      inputSchema: {
        type: 'object',
        properties: { intent: { type: 'string', enum: [...INTENT_KINDS] } },
        required: ['intent'],
      },
    },
    async execute(raw) {
      const input = intentInput.safeParse(raw);
      if (!input.success) return invalidInput(`{ "intent": one of ${INTENT_KINDS.join(' | ')} }`);
      return {
        resultText: 'Noted — keep answering the question normally.',
        action: { kind: 'intent', intent: input.data.intent },
      };
    },
  };

  return new Map(
    [searchNotes, searchCatalogue, clinicianHandoff, flagIntent].map((t) => [t.spec.name, t]),
  );
}
