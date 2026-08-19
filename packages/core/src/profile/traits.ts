import { z } from 'zod';
import { US_STATE_CODES } from '../onboarding/us-states';

/**
 * The trait registry: the schema of a person, as the platform understands it.
 *
 * Questions, the companion, clinicians and (later) labs and orders are all
 * *sources* of traits; protocols, segments, gates and the brain's member
 * context are all *readers*. The quiz can change every week; the trait keys
 * are the contract that stays put. A question binds to exactly one trait, and
 * nothing downstream ever sees a question id.
 *
 * Two rules live here and nowhere else:
 *
 * 1. Every trait carries a **sensitivity tier**. `marketing` is the class the
 *    waitlist already holds (goal, state, preferences), `personal` is identity
 *    data that is not health information on its own (name, email, date of
 *    birth, consent), `health` is what becomes PHI the moment it is tied to a
 *    person (height/weight, medications, conditions). The publish validator
 *    refuses any flow that asks a `health` trait until the PHI keys are turned
 *    (see docs/onboarding/00-plan.md section 3.9). Tiers are decided in code,
 *    by engineers, never in admin.
 * 2. Registered traits are typed. An admin can also bind a question to a
 *    `custom.<slug>` trait without a deploy; those are always marketing tier
 *    and take their type from the question that asks them.
 *
 * Browser-safe: no db, no AWS. Exported through `@joice/core/schemas`.
 */

export const TRAIT_TYPES = [
  'string',
  'number',
  'boolean',
  'date',
  'enum',
  'enum_list',
  'us_state',
  'height_weight',
] as const;
export const traitTypeSchema = z.enum(TRAIT_TYPES);
export type TraitType = z.infer<typeof traitTypeSchema>;

export const SENSITIVITY_TIERS = ['marketing', 'personal', 'health'] as const;
export const sensitivitySchema = z.enum(SENSITIVITY_TIERS);
export type Sensitivity = z.infer<typeof sensitivitySchema>;

export interface TraitDef {
  /** Stable snake_case key. Renaming a key is a migration, not an edit. */
  readonly key: string;
  readonly type: TraitType;
  readonly sensitivity: Sensitivity;
  /** Short human label for admin tables, summaries and the simulator. */
  readonly label: string;
  /** Allowed values for `enum` / `enum_list` traits. */
  readonly values?: readonly string[];
  /** Computed by the projector from other traits; never asked directly. */
  readonly derived?: boolean;
  /** Display unit for numbers (years, kg, ...). */
  readonly unit?: string;
}

/**
 * The care areas a visitor can be here for, plus the honest "not sure". Same
 * slugs as `CARE_AREAS` in `packages/brain/src/profile/schemas.ts` and
 * `apps/web/lib/site-content.ts`; story 4.5 of the onboarding epic makes both
 * import from here. There is deliberately no cognition or longevity area until
 * a protocol exists behind one.
 */
export const GOAL_VALUES = [
  'weight-metabolic',
  'body-comp-recovery',
  'beauty-skin',
  'energy',
  'stress-sleep',
  'not-sure',
] as const;

export const AGE_BANDS = ['under_18', '18_24', '25_34', '35_44', '45_54', '55_64', '65_plus'] as const;
export const SERVICE_AREA_STATUSES = ['open', 'notify', 'closed'] as const;
export type ServiceAreaStatus = (typeof SERVICE_AREA_STATUSES)[number];

const REGISTRY = [
  // Identity (personal)
  { key: 'first_name', type: 'string', sensitivity: 'personal', label: 'First name' },
  { key: 'email', type: 'string', sensitivity: 'personal', label: 'Email' },
  { key: 'date_of_birth', type: 'date', sensitivity: 'personal', label: 'Date of birth' },

  // Eligibility (marketing-grade: a state and a status, nothing more)
  { key: 'us_state', type: 'us_state', sensitivity: 'marketing', label: 'State' },
  {
    key: 'state_status',
    type: 'enum',
    sensitivity: 'marketing',
    label: 'Service area status',
    values: SERVICE_AREA_STATUSES,
    derived: true,
  },
  { key: 'age', type: 'number', sensitivity: 'personal', label: 'Age', unit: 'years', derived: true },
  { key: 'age_band', type: 'enum', sensitivity: 'marketing', label: 'Age band', values: AGE_BANDS, derived: true },
  { key: 'age_eligible', type: 'boolean', sensitivity: 'marketing', label: 'Meets minimum age', derived: true },

  // Goal and intent (marketing)
  { key: 'goal', type: 'enum', sensitivity: 'marketing', label: 'Primary goal', values: GOAL_VALUES },
  { key: 'goal_note', type: 'string', sensitivity: 'marketing', label: 'Goal, in their words' },
  {
    key: 'goal_timeline',
    type: 'enum',
    sensitivity: 'marketing',
    label: 'Timeline',
    values: ['3mo', '6mo', '12mo', 'no_rush'],
  },
  {
    key: 'peptide_experience',
    type: 'enum',
    sensitivity: 'marketing',
    label: 'Peptide experience',
    values: ['none', 'some', 'regular'],
  },
  // Approaches tried sits on the personal tier until counsel confirms it is
  // not consumer health data in the states that regulate it.
  {
    key: 'weight_approaches_tried',
    type: 'enum_list',
    sensitivity: 'personal',
    label: 'Weight approaches tried',
    values: ['diet', 'training', 'coaching', 'medication', 'none'],
  },
  { key: 'segment', type: 'string', sensitivity: 'marketing', label: 'Segment', derived: true },

  // Consent (personal, versioned by the flow version that asked)
  { key: 'consent_terms', type: 'boolean', sensitivity: 'personal', label: 'Agreed to Terms and Privacy' },
  { key: 'consent_marketing', type: 'boolean', sensitivity: 'personal', label: 'Marketing emails opt-in' },
] as const satisfies readonly TraitDef[];

export type TraitKey = (typeof REGISTRY)[number]['key'];

/** The registry, keyed. Frozen: tiers and types change by deploy, never at runtime. */
export const TRAITS: Readonly<Record<TraitKey, TraitDef>> = Object.freeze(
  Object.fromEntries(REGISTRY.map((t) => [t.key, t])) as Record<TraitKey, TraitDef>,
);

export const TRAIT_KEYS = REGISTRY.map((t) => t.key) as unknown as readonly [TraitKey, ...TraitKey[]];
export const traitKeySchema = z.enum(TRAIT_KEYS);

/** `custom.<slug>`: admin-created, always marketing tier, typed by its question. */
export const CUSTOM_TRAIT_PREFIX = 'custom.';
export const customTraitKeySchema = z
  .string()
  .regex(/^custom\.[a-z][a-z0-9_]{0,62}$/, 'Custom traits look like custom.my_slug');

/** Anything a question may bind to or a condition may reference. */
export const traitRefSchema = z.union([traitKeySchema, customTraitKeySchema]);
export type TraitRef = z.infer<typeof traitRefSchema>;

export function isCustomTrait(key: string): boolean {
  return customTraitKeySchema.safeParse(key).success;
}

export function isRegisteredTrait(key: string): key is TraitKey {
  return Object.prototype.hasOwnProperty.call(TRAITS, key);
}

/** The registered definition, or null for custom / unknown keys. */
export function getTrait(key: string): TraitDef | null {
  return isRegisteredTrait(key) ? TRAITS[key] : null;
}

/** Custom traits are marketing tier by construction; unknown keys are not a tier. */
export function sensitivityOf(key: string): Sensitivity | null {
  if (isRegisteredTrait(key)) return TRAITS[key].sensitivity;
  return isCustomTrait(key) ? 'marketing' : null;
}

export function isDerivedTrait(key: string): boolean {
  return getTrait(key)?.derived === true;
}

/** Every registered trait at or above a tier, for the publish validator. */
export function traitsWithSensitivity(tier: Sensitivity): TraitDef[] {
  return REGISTRY.filter((t) => t.sensitivity === tier);
}

/** ISO calendar date, `YYYY-MM-DD`, that is also a real day. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, 'Not a real date');

export const heightWeightSchema = z.object({
  heightCm: z.number().finite().min(50).max(272),
  weightKg: z.number().finite().min(20).max(500),
});
export type HeightWeight = z.infer<typeof heightWeightSchema>;

/**
 * A value validator for a trait type, with the enum vocabulary when there is
 * one. The engine uses this to validate answers against the pinned definition;
 * the projector uses it to refuse malformed observations.
 */
export function traitValueSchema(
  type: TraitType,
  values?: readonly string[],
): z.ZodTypeAny {
  switch (type) {
    case 'string':
      return z.string().trim().min(1).max(500);
    case 'number':
      return z.number().finite();
    case 'boolean':
      return z.boolean();
    case 'date':
      return isoDateSchema;
    case 'enum': {
      if (!values || values.length === 0) return z.never();
      return z.enum(values as unknown as [string, ...string[]]);
    }
    case 'enum_list': {
      if (!values || values.length === 0) return z.never();
      const item = z.enum(values as unknown as [string, ...string[]]);
      return z
        .array(item)
        .min(1)
        .max(values.length)
        .refine((arr) => new Set(arr).size === arr.length, 'No repeats');
    }
    case 'us_state':
      return z.enum(US_STATE_CODES);
    case 'height_weight':
      return heightWeightSchema;
  }
}

/** Validate a value for a registered trait; custom traits need the question's type. */
export function validateTraitValue(
  key: string,
  value: unknown,
  customType?: TraitType,
): z.SafeParseReturnType<unknown, unknown> {
  const def = getTrait(key);
  if (def) return traitValueSchema(def.type, def.values).safeParse(value);
  if (isCustomTrait(key) && customType) return traitValueSchema(customType).safeParse(value);
  return z.never().safeParse(value);
}
