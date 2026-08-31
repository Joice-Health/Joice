import type { ToolExecutor } from '../generation/agent-loop';
import { clinicianHandoffTool } from './clinician-handoff';
import { flagIntentTool } from './flag-intent';
import { searchCatalogueTool } from './search-catalogue';
import { searchNotesTool } from './search-notes';
import type { ToolDeps } from './types';

/**
 * The companion's toolbelt: one file per tool, this file is the registry.
 * Adding a tool is a new module exporting a BrainTool plus a line in TOOLS;
 * the checklist (eval case, provenance decision, safety floor, doc row) is
 * docs/rag/13-toolbelt.md.
 *
 * Design rules (every tool, enforced by review):
 * - Read-only or signal-only. Nothing here writes anywhere. Anything that
 *   changes the world (cart, later) is propose-confirm: the tool can only
 *   draw a card; a plain endpoint the model can't reach executes the click.
 * - Every executor validates its own input (the stream parser degrades
 *   malformed tool JSON to `{}`) and answers a mismatch with `isError` so the
 *   model can recover instead of the request dying.
 * - Descriptions carry the trigger conditions ("call this when…") — Nova
 *   follows prescriptive descriptions far more reliably than implied ones.
 * - Cross-domain data enters through a port (../ports), never a table import;
 *   the db-boundary tests hold the table half of that line.
 */

const TOOLS = [searchNotesTool, searchCatalogueTool, clinicianHandoffTool, flagIntentTool];

/**
 * Visitor-facing status copy per tool name, defined on each tool so a new
 * tool cannot forget its label. Empty string = deliberately silent.
 */
export const toolLabels: Readonly<Record<string, string>> = Object.fromEntries(
  TOOLS.map((tool) => [tool.spec.name, tool.label]),
);

/**
 * Builds the per-request executor map. Executors are closures over that
 * request's deps (citation registry, speculative prefetch) — nothing is
 * shared between requests.
 */
export function buildToolExecutors(deps: ToolDeps): Map<string, ToolExecutor> {
  return new Map(
    TOOLS.map((tool) => [tool.spec.name, { spec: tool.spec, execute: tool.create(deps) }]),
  );
}

export { similarQueries } from './search-notes';
export type { BrainTool, NotesPrefetch, ToolDeps } from './types';
