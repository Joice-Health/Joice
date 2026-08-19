import { z } from 'zod';
import { traitRefSchema } from '../profile/traits';

/**
 * The one condition language.
 *
 * Branching ("show this question when"), gates ("stop when"), segment rules
 * ("this person is a ... when") and, later, protocol eligibility all evaluate
 * the same small predicate over traits. One evaluator, one validator, one
 * simulator; a rule an admin builds with dropdowns for a question is the rule
 * a clinician will later read for a protocol.
 *
 * Deliberately tiny and explicit (trait, op, value) rather than JSONLogic, so
 * the registry can validate every leaf (is `gt` allowed on an enum?), the
 * "why" trace can name every leaf, and the admin builder round-trips the
 * shape without a parser. Same operator set; see docs/onboarding/00-plan.md
 * section 3.4 for the reasoning.
 *
 * Browser-safe. Exported through `@joice/core/schemas`.
 */

export const CONDITION_OPS = [
  'eq',
  'neq',
  'in',
  'nin',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'contains',
  'exists',
] as const;
export const conditionOpSchema = z.enum(CONDITION_OPS);
export type ConditionOp = z.infer<typeof conditionOpSchema>;

/**
 * A value that is read from settings at evaluation time instead of being
 * written into the rule, e.g. `{ "setting": "onboarding.minimumAge" }`, so the
 * minimum age lives in one admin-owned place and every rule that references it
 * follows.
 */
export const settingRefSchema = z
  .object({ setting: z.string().regex(/^[a-z][a-zA-Z0-9_.]{0,98}$/) })
  .strict();
export type SettingRef = z.infer<typeof settingRefSchema>;

export function isSettingRef(value: unknown): value is SettingRef {
  return settingRefSchema.safeParse(value).success;
}

export interface ConditionLeaf {
  trait: string;
  op: ConditionOp;
  value?: unknown;
}
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | ConditionLeaf;

export const conditionLeafSchema = z
  .object({
    trait: traitRefSchema,
    op: conditionOpSchema,
    value: z.unknown().optional(),
  })
  .strict();

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(conditionSchema).min(1) }).strict(),
    z.object({ any: z.array(conditionSchema).min(1) }).strict(),
    z.object({ not: conditionSchema }).strict(),
    conditionLeafSchema,
  ]),
);

export function isLeaf(cond: Condition): cond is ConditionLeaf {
  return 'trait' in cond;
}

/** Every trait key a condition references, deduplicated, in first-seen order. */
export function conditionTraits(cond: Condition): string[] {
  const seen = new Set<string>();
  const walk = (c: Condition) => {
    if (isLeaf(c)) {
      seen.add(c.trait);
    } else if ('all' in c) {
      c.all.forEach(walk);
    } else if ('any' in c) {
      c.any.forEach(walk);
    } else {
      walk(c.not);
    }
  };
  walk(cond);
  return [...seen];
}
