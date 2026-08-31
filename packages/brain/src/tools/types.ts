import type { ToolExecutor, ToolOutcome } from '../generation/agent-loop';
import type { RetrievedChunk } from '../generation/answer-service';
import type { CatalogPort } from '../ports';

/**
 * The shape every tool module exports: the Bedrock-advertised spec, the
 * visitor-facing label, and a factory that builds the per-request executor.
 * One tool, one file, everything the rest of the system needs in one object;
 * the registry in index.ts is the only place that enumerates tools.
 */
export interface BrainTool {
  /** Advertised to the model. `spec.name` is the registry key. */
  spec: ToolExecutor['spec'];
  /**
   * Status-line copy shown to the visitor while the tool runs, mapped
   * server-side so the client stays dumb. Empty string = deliberately
   * silent: the tool runs without the interface acknowledging it, and it is
   * excluded from the tools-used trace.
   */
  label: string;
  /**
   * Builds the executor for one request. Executors are closures over that
   * request's deps (citation registry, speculative prefetch) — nothing is
   * shared between requests.
   */
  create(deps: ToolDeps): ToolExecutor['execute'];
}

export interface NotesPrefetch {
  /** Resolves with the condensed query and its results, or null on any failure. */
  promise: Promise<{ query: string; chunks: RetrievedChunk[] } | null>;
}

export interface ToolDeps {
  retrieve: (
    query: string,
    opts: { topK: number; similarityFloor: number; sourceTypes?: string[] },
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

export function invalidInput(expected: string): ToolOutcome {
  return { resultText: `Invalid input — expected ${expected}.`, isError: true };
}
