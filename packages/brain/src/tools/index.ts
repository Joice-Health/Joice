import { tierAtLeast, type AudienceTier } from '@joice/utils';
import type { ToolAccess } from '../config/schemas';
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
 * Does an access setting admit this audience? 'off' admits nobody; a tier is
 * the minimum. Undefined means 'visitor' (the schema default), so a minimal
 * test config gets the full belt.
 */
export function toolAccessAllows(setting: ToolAccess | undefined, audience: AudienceTier): boolean {
  const minimum = setting ?? 'visitor';
  return minimum !== 'off' && tierAtLeast(audience, minimum);
}

/**
 * Builds the per-request executor map, filtered by each tool's access
 * setting against the requester's audience: a tool the tier does not clear
 * is never advertised to the model, so it is invisible rather than refused.
 * Executors are closures over that request's deps (citation registry,
 * speculative prefetch) — nothing is shared between requests.
 */
export function buildToolExecutors(deps: ToolDeps): Map<string, ToolExecutor> {
  const audience = deps.audience;
  return new Map(
    TOOLS.filter((tool) => toolAccessAllows(deps.config[tool.settingKey], audience)).map(
      (tool) => [tool.spec.name, { spec: tool.spec, execute: tool.create(deps) }],
    ),
  );
}

export { similarQueries } from './search-notes';
export type { BrainTool, NotesPrefetch, ToolDeps } from './types';
