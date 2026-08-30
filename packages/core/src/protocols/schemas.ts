import { z } from 'zod';
import { conditionSchema } from '../rules/conditions';
import type { WhyNode } from '../rules/evaluate';

/**
 * Protocol rules: conditions over traits and segment that name which protocol
 * a profile matches. The sketch the brief promised (docs/onboarding/00-plan.md
 * section 3.12): the same condition language as gates and segments, evaluated
 * by the same evaluator, previewed in the same simulator. A match is a
 * RECOMMENDATION RECORD for a clinician and the admin simulator, never a
 * prescription and never member-facing; `requiresClinician` is a literal true
 * so no rule can even claim otherwise.
 *
 * Browser-safe: zod + the condition language only.
 */

export const protocolRuleSchema = z
  .object({
    /** Stable kebab-case key the protocol catalogue will use later. */
    protocolKey: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/, 'Keys are kebab-case, letters first'),
    label: z.string().min(1).max(120),
    when: conditionSchema,
    /** Higher wins; ties keep authoring order. */
    priority: z.number().int(),
    /** A match is never a prescription. Structurally not editable. */
    requiresClinician: z.literal(true),
  })
  .strict();
export type ProtocolRule = z.infer<typeof protocolRuleSchema>;

export const protocolRulesSchema = z.array(protocolRuleSchema).max(100);
export type ProtocolRules = z.infer<typeof protocolRulesSchema>;

/** One matched rule, ranked, with the evaluator's why-trace for the panel. */
export interface ProtocolMatch {
  protocolKey: string;
  label: string;
  priority: number;
  requiresClinician: true;
  why: WhyNode;
}
