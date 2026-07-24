import { z } from 'zod';

/**
 * The pre-onboarding companion's capture contract.
 *
 * Browser-safe: no AWS or Postgres imports. The web app types its capture
 * widgets against exactly what the brain service validates against, so a field
 * the UI can submit is a field the server accepts, and vice versa.
 *
 * Structured capture (name, email, goal) is a deterministic state machine over
 * these types, NOT an LLM turn — the assistant asks in warm copy, the UI renders
 * the matching widget, and this schema is the single source of truth for what a
 * step looks like and what a valid answer is.
 */

/**
 * The care areas a visitor can be here for. This is the warm-lead signal — a
 * lead tagged `weight-metabolic` is worth far more than a name.
 *
 * ⚠️ Must stay in sync with `CARE_AREAS` in apps/web/lib/site-content.ts. These
 * are the ONLY valid goals; there is deliberately no "cognitive" area, so the
 * companion cannot route anyone to a care area with no protocol behind it.
 */
export const CARE_AREAS = [
  { slug: 'weight-metabolic', label: 'Weight & metabolic' },
  { slug: 'body-comp-recovery', label: 'Body comp / recovery' },
  { slug: 'beauty-skin', label: 'Beauty / skin' },
  { slug: 'energy', label: 'Energy' },
  { slug: 'stress-sleep', label: 'Stress & sleep' },
] as const;

/** `not-sure` is a first-class answer — an undecided visitor is still a lead. */
export const GOAL_UNSURE = 'not-sure';

const CARE_AREA_SLUGS = CARE_AREAS.map((a) => a.slug);
/** Every acceptable `goal` value: a real care area, or an honest "not sure". */
export const GOAL_VALUES = [...CARE_AREA_SLUGS, GOAL_UNSURE] as const;

/** The fields the companion captures, in the order it asks for them. */
export const CAPTURE_FIELDS = ['name', 'email', 'goal'] as const;
export type CaptureField = (typeof CAPTURE_FIELDS)[number];

/**
 * How the UI should render the input for a step. `text`/`email` are free entry;
 * `choice` renders the provided options as quick-reply chips (goal only).
 */
export const captureInputSchema = z.object({
  type: z.enum(['text', 'email', 'choice']),
  choices: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
});
export type CaptureInput = z.infer<typeof captureInputSchema>;

/**
 * The next thing the companion wants to ask, or null when capture is complete.
 * `skippable` is false for nothing today, but the flag exists so a future
 * required field (e.g. location as a serviceability gate) is a data change.
 */
export const captureStepSchema = z.object({
  field: z.enum(CAPTURE_FIELDS),
  /** The assistant's line, e.g. "First — what should I call you?" */
  prompt: z.string(),
  input: captureInputSchema,
  skippable: z.boolean(),
});
export type CaptureStep = z.infer<typeof captureStepSchema>;

/** The lead as the browser is allowed to see it. */
export const companionProfileSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  goal: z.string().nullable(),
  goalLabel: z.string().nullable(),
  readyForOnboarding: z.boolean(),
  status: z.enum(['capturing', 'exploring', 'ready', 'converted']),
});
export type CompanionProfile = z.infer<typeof companionProfileSchema>;

/** Admin-managed companion copy, resolved from config and sent with the profile. */
export const companionCopySchema = z.object({
  greeting: z.string(),
  conversionPrompt: z.string(),
  conversionCtaLabel: z.string(),
});
export type CompanionCopy = z.infer<typeof companionCopySchema>;

/** GET /api/brain/profile — everything the UI needs to drive the next turn. */
export const companionStateSchema = z.object({
  profile: companionProfileSchema,
  /** Null once name, email and goal are each answered or skipped. */
  nextStep: captureStepSchema.nullable(),
  copy: companionCopySchema,
});
export type CompanionState = z.infer<typeof companionStateSchema>;

/**
 * POST /api/brain/profile — a discriminated union so the server validates each
 * intent on its own terms: a field value is validated per field, a skip only
 * needs the field name, and readiness needs nothing.
 */
export const submitFieldSchema = z.object({
  kind: z.literal('field'),
  field: z.enum(CAPTURE_FIELDS),
  /** Validated against the field below (email format, goal vocabulary, …). */
  value: z.string().trim().min(1).max(200),
  /** Only for goal === not-sure: a free-text elaboration. */
  note: z.string().trim().max(500).optional(),
});

export const skipFieldSchema = z.object({
  kind: z.literal('skip'),
  field: z.enum(CAPTURE_FIELDS),
});

export const readySchema = z.object({
  kind: z.literal('ready'),
});

export const companionActionSchema = z.discriminatedUnion('kind', [
  submitFieldSchema,
  skipFieldSchema,
  readySchema,
]);
export type CompanionAction = z.infer<typeof companionActionSchema>;

/** Response to POST /api/brain/profile: the new state, plus any handoff. */
export const companionActionResultSchema = companionStateSchema.extend({
  /** Present after a `ready` action — where to send the visitor to convert. */
  handoff: z.object({ href: z.string() }).optional(),
});
export type CompanionActionResult = z.infer<typeof companionActionResultSchema>;

/** True if `value` is a syntactically valid email. Shared by client and server. */
export function isValidEmail(value: string): boolean {
  // Deliberately permissive: the goal is to reject "what is bpc-157?" typed into
  // an email field, not to police RFC 5322. Delivery is the real validator.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
