/**
 * Load the authored goal-branch content (story sc-165) into the flow editor
 * as a DRAFT: merge docs/onboarding/content/goal-branches.json into a copy of
 * the live published definition, save it, print the validation report.
 * Nothing publishes itself; an admin reviews the draft in /admin/onboarding
 * and clicks Publish.
 *
 *   bun apps/api/scripts/load-goal-branches.ts            # against DATABASE_URL
 *
 * Idempotent-ish: sections and questions whose keys already exist in the
 * published definition are skipped, so re-running after a partial adoption
 * only adds what is missing. Runs with phiEnabled=false deliberately: this
 * content is marketing/personal tier only, and the report should prove it.
 */
import { z } from 'zod';
import { createDatabase } from '@joice/db';
import {
  FLOW_KEY,
  createAuditService,
  createFlowService,
  flowDefinitionSchema,
  type FlowDefinition,
} from '@joice/core';

const env = z.object({ DATABASE_URL: z.string().url() }).parse(process.env);

const contentSchema = z.object({
  insertAfterSection: z.string(),
  sections: z.array(z.unknown()),
  questions: z.record(z.string(), z.unknown()),
  copy: z.record(z.string(), z.string()),
});

const contentPath = new URL('../../../docs/onboarding/content/goal-branches.json', import.meta.url);
const content = contentSchema.parse(await Bun.file(contentPath).json());

const db = createDatabase(env.DATABASE_URL);
const audit = createAuditService(db);
const flows = createFlowService(db, audit, { phiEnabled: async () => false });
const actor = { clerkUserId: 'script:load-goal-branches', email: 'engineering@joicehealth.com' };

const published = await flows.getPublished(FLOW_KEY);
const base = published.definition as FlowDefinition;

const existingSectionKeys = new Set(base.sections.map((s) => s.key));
const newSections = (content.sections as FlowDefinition['sections']).filter((s) => {
  if (existingSectionKeys.has(s.key)) {
    console.log(`skip section ${s.key}: already in the published definition`);
    return false;
  }
  return true;
});
const newQuestions = Object.fromEntries(
  Object.entries(content.questions as FlowDefinition['questions']).filter(([key]) => {
    if (base.questions[key]) {
      console.log(`skip question ${key}: already in the bank`);
      return false;
    }
    return true;
  }),
);

const anchor = base.sections.findIndex((s) => s.key === content.insertAfterSection);
const at = anchor === -1 ? base.sections.length - 1 : anchor + 1;
const merged: FlowDefinition = flowDefinitionSchema.parse({
  ...base,
  sections: [...base.sections.slice(0, at), ...newSections, ...base.sections.slice(at)],
  questions: { ...base.questions, ...newQuestions },
  copy: { ...base.copy, ...content.copy },
});

const draft = await flows.createDraft(FLOW_KEY, { notes: 'Goal branches (sc-165), for review' }, actor);
const { report } = await flows.saveDraft(draft.id, { definition: merged }, actor);

console.log(`draft v${draft.version} saved with ${newSections.length} new sections, ${Object.keys(newQuestions).length} new questions`);
console.log(`report: ${report.ok ? 'validates clean' : 'ERRORS'}; ${report.errors.length} errors, ${report.warnings.length} warnings`);
for (const issue of [...report.errors, ...report.warnings]) {
  console.log(`  ${report.errors.includes(issue) ? 'error' : 'warning'} ${issue.code} at ${issue.path}: ${issue.message}`);
}
process.exit(report.ok ? 0 : 1);
