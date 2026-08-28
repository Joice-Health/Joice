import { z } from 'zod';
import { conditionSchema } from '../rules/conditions';
import { isoDateSchema, traitRefSchema, type TraitType } from '../profile/traits';

/**
 * The flow definition: what admins edit, what gets versioned, what the engine
 * runs. "Store a bank, show sections": questions live in one keyed bank, each
 * bound to a trait; sections are ordered lists of question keys with their own
 * show-when rule and gates. Branching is a condition on a section or a
 * question, never an edge in a graph, so the simulator can always answer "what
 * does a 34-year-old in Texas see, in what order".
 *
 * Browser-safe: the admin editor validates against exactly what the api
 * publishes. See docs/onboarding/00-plan.md section 3.3.
 */

export const FLOW_SCHEMA_VERSION = 1 as const;
export const FLOW_KEY = 'intake' as const;

/** Stable snake_case identifiers for sections and questions. */
export const flowKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,63}$/, 'Keys are snake_case, letters first');

export const QUESTION_TYPES = [
  'single_select',
  'multi_select',
  'number',
  'text',
  'date',
  'us_state',
  'height_weight',
  'boolean',
  'scale',
] as const;
export const questionTypeSchema = z.enum(QUESTION_TYPES);
export type QuestionType = z.infer<typeof questionTypeSchema>;

/**
 * The trait type each question type produces. Registered traits must match;
 * custom traits take this type (single_select becomes an enum over the
 * question's options, multi_select an enum_list over them).
 */
export const TRAIT_TYPE_FOR_QUESTION: Readonly<Record<QuestionType, TraitType>> = {
  single_select: 'enum',
  multi_select: 'enum_list',
  number: 'number',
  text: 'string',
  date: 'date',
  us_state: 'us_state',
  height_weight: 'height_weight',
  boolean: 'boolean',
  scale: 'number',
};

export const optionSchema = z
  .object({
    value: z.string().min(1).max(64),
    label: z.string().min(1).max(120),
    help: z.string().max(300).optional(),
  })
  .strict();
export type QuestionOption = z.infer<typeof optionSchema>;

export const questionCopySchema = z
  .object({
    label: z.string().min(1).max(240),
    help: z.string().max(600).optional(),
    placeholder: z.string().max(120).optional(),
  })
  .strict();

export const questionConstraintsSchema = z
  .object({
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    step: z.number().positive().optional(),
    maxLength: z.number().int().positive().max(500).optional(),
    minDate: isoDateSchema.optional(),
    maxDate: isoDateSchema.optional(),
    unit: z.enum(['imperial', 'metric']).optional(),
  })
  .strict();

export const questionSchema = z
  .object({
    key: flowKeySchema,
    trait: traitRefSchema,
    type: questionTypeSchema,
    copy: questionCopySchema,
    /** Required for single_select / multi_select, forbidden otherwise. */
    options: z.array(optionSchema).min(1).max(40).optional(),
    constraints: questionConstraintsSchema.optional(),
    required: z.boolean().default(true),
    showIf: conditionSchema.optional(),
    /** Eligibility and consent questions: content an admin cannot change. */
    locked: z.boolean().default(false),
  })
  .strict();
export type FlowQuestion = z.infer<typeof questionSchema>;
export type FlowQuestionInput = z.input<typeof questionSchema>;

export const GATE_OUTCOMES = ['stop', 'notify', 'closed'] as const;
export const gateOutcomeSchema = z.enum(GATE_OUTCOMES);
export type GateOutcome = z.infer<typeof gateOutcomeSchema>;

export const GATE_REASONS = ['age', 'state', 'custom'] as const;
export const gateReasonSchema = z.enum(GATE_REASONS);
export type GateReason = z.infer<typeof gateReasonSchema>;

/**
 * A gate is evaluated when its section has no question left to ask; the first
 * gate whose condition holds ends the flow with its outcome. No gate matching
 * means "continue". Gate copy lives in the definition's copy map under the
 * given key prefix (`<copyKey>.title`, `<copyKey>.body`).
 */
export const gateSchema = z
  .object({
    key: flowKeySchema,
    when: conditionSchema,
    outcome: gateOutcomeSchema,
    reason: gateReasonSchema,
    copyKey: z.string().min(1).max(100),
  })
  .strict();
export type FlowGate = z.infer<typeof gateSchema>;

export const sectionSchema = z
  .object({
    key: flowKeySchema,
    title: z.string().min(1).max(120),
    intro: z.string().max(600).optional(),
    showIf: conditionSchema.optional(),
    /** Question keys, in the order they are asked. */
    questions: z.array(flowKeySchema).min(1),
    gates: z.array(gateSchema).default([]),
    locked: z.boolean().default(false),
  })
  .strict();
export type FlowSection = z.infer<typeof sectionSchema>;

export const segmentRuleSchema = z
  .object({
    segment: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    when: conditionSchema,
    /** Higher wins when several rules match. */
    priority: z.number().int(),
  })
  .strict();
export type SegmentRule = z.infer<typeof segmentRuleSchema>;

export const completionSchema = z
  .object({
    title: z.string().min(1).max(160),
    body: z.string().min(1).max(1000),
    cta: z.string().min(1).max(60),
  })
  .strict();

export const flowDefinitionSchema = z
  .object({
    schemaVersion: z.literal(FLOW_SCHEMA_VERSION),
    key: z.literal(FLOW_KEY),
    sections: z.array(sectionSchema).min(1),
    /** The question bank, keyed by question key. */
    questions: z.record(flowKeySchema, questionSchema),
    segmentRules: z.array(segmentRuleSchema).default([]),
    /** Copy referenced by key: intro, gates, resume note. Admin-editable. */
    copy: z.record(z.string().min(1).max(100), z.string().max(2000)),
    completion: completionSchema,
  })
  .strict();
export type FlowDefinition = z.infer<typeof flowDefinitionSchema>;
export type FlowDefinitionInput = z.input<typeof flowDefinitionSchema>;

/** The locked sections every intake flow must carry, and where. */
export const ELIGIBILITY_SECTION_KEY = 'eligibility';

/**
 * The locked core, shared by the publish validator and the editor so they can
 * never disagree about what is removable: each entry names a section that must
 * exist and the traits it must still ask (locked and, where listed, required).
 * Only eligibility is here. The consent section used to be too; by decision
 * (Shaun, 2026-08-26) terms acceptance is the flow author's to place, in the
 * flow or on the Clerk sign-up screen, so it is ordinary content now.
 */
export const LOCKED_SECTIONS: Readonly<
  Record<string, { traits: readonly string[]; requiredTraits: readonly string[] }>
> = {
  [ELIGIBILITY_SECTION_KEY]: {
    traits: ['us_state', 'date_of_birth'],
    requiredTraits: ['us_state', 'date_of_birth'],
  },
};

/** True when the editor must not offer removing this section. */
export function isProtectedSection(sectionKey: string): boolean {
  return sectionKey in LOCKED_SECTIONS;
}

/** True when the editor must not offer removing or restructuring this question. */
export function isProtectedQuestion(sectionKey: string, trait: string): boolean {
  return LOCKED_SECTIONS[sectionKey]?.traits.includes(trait) ?? false;
}

/* ------------------------------------------------------------------------- */
/* Wire contracts: what the browser sends and sees                           */
/* ------------------------------------------------------------------------- */

export const SESSION_STATUSES = [
  'in_progress',
  'gated_age',
  'gated_state',
  'completed',
  'registered',
  'abandoned',
] as const;
export const sessionStatusSchema = z.enum(SESSION_STATUSES);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

/** What the companion hands over. Never answers: the visitor confirms each value. */
export const carryOverSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    email: z.string().trim().toLowerCase().email().max(254),
    goal: z.string().trim().min(1).max(64),
  })
  .partial()
  .strict();
export type CarryOverInput = z.infer<typeof carryOverSchema>;

export const startSessionSchema = z.object({ carryOver: carryOverSchema.optional() }).strict();
export type StartSessionInput = z.infer<typeof startSessionSchema>;

/** The value is validated by the engine against the pinned definition. */
export const answerSchema = z.object({ questionKey: flowKeySchema, value: z.unknown() }).strict();
export type AnswerInput = z.infer<typeof answerSchema>;

export const skipSchema = z.object({ questionKey: flowKeySchema }).strict();
export type SkipInput = z.infer<typeof skipSchema>;

/** The state comes from the session's gate, never from the body. */
export const notifyRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().min(3).max(254).email('Enter a valid email'),
    firstName: z.string().trim().max(80).optional(),
  })
  .strict();
export type NotifyRequestInput = z.infer<typeof notifyRequestSchema>;

export const claimSchema = z
  .object({
    /** Reserved for the waitlist bridge; stored, not acted on yet. */
    referralCode: z.string().trim().max(64).optional(),
  })
  .strict();
export type ClaimInput = z.infer<typeof claimSchema>;

export const summaryRowSchema = z.object({ questionKey: z.string(), label: z.string(), value: z.string() });

export const progressSchema = z.object({
  sectionIndex: z.number().int().nonnegative(),
  sectionCount: z.number().int().positive(),
  answered: z.number().int().nonnegative(),
  remainingEstimate: z.number().int().nonnegative(),
  percent: z.number().int().min(0).max(100),
});
export type ProgressView = z.infer<typeof progressSchema>;

export const questionViewSchema = z.object({
  key: flowKeySchema,
  type: questionTypeSchema,
  copy: questionCopySchema,
  options: z.array(optionSchema).optional(),
  constraints: questionConstraintsSchema.optional(),
  required: z.boolean(),
  sensitivity: z.enum(['marketing', 'personal', 'health']),
});

export const gateViewSchema = z.object({
  gateKey: flowKeySchema,
  sectionKey: flowKeySchema,
  outcome: gateOutcomeSchema,
  reason: gateReasonSchema,
  /** Resolved copy: title, body, and optional cta / done lines. */
  copy: z.object({
    title: z.string(),
    body: z.string(),
    cta: z.string().optional(),
    done: z.string().optional(),
  }),
  stateCode: z.string().optional(),
  stateName: z.string().optional(),
  notifySubmitted: z.boolean(),
});
export type GateView = z.infer<typeof gateViewSchema>;

export const stepViewSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('question'),
    section: z.object({ key: flowKeySchema, title: z.string(), intro: z.string().optional() }),
    question: questionViewSchema,
    value: z.unknown(),
    carriedOver: z.boolean(),
    canGoBack: z.boolean(),
  }),
  z.object({ kind: z.literal('gate'), gate: gateViewSchema }),
  z.object({
    kind: z.literal('complete'),
    copy: completionSchema,
    summary: z.array(summaryRowSchema),
    segment: z.string().nullable(),
    nextHref: z.string(),
  }),
]);
export type StepView = z.infer<typeof stepViewSchema>;

/** GET /api/onboarding/session and the result of every action. */
export const sessionStateSchema = z.object({
  sessionId: z.string().uuid(),
  flowVersion: z.number().int().positive(),
  status: sessionStatusSchema,
  step: stepViewSchema,
  progress: progressSchema,
  /** Answered so far, on the current path, for a review list. */
  answers: z.array(summaryRowSchema),
  carryOver: carryOverSchema.nullable(),
  /** Intro and resume copy the client renders around the first step. */
  copy: z.object({
    introTitle: z.string(),
    introBody: z.string(),
    carriedTitle: z.string().optional(),
    carriedBody: z.string().optional(),
    resumeNote: z.string().optional(),
  }),
  memberId: z.string().uuid().nullable(),
});
export type SessionState = z.infer<typeof sessionStateSchema>;

/** A rejected action: the code the client can branch on, the question it concerns. */
export const actionErrorSchema = z.object({
  error: z.string(),
  code: z.enum(['unknown_question', 'not_eligible', 'invalid_value', 'required', 'gated', 'not_gated', 'no_session']),
  questionKey: z.string().optional(),
});
export type ActionError = z.infer<typeof actionErrorSchema>;

/* ------------------------------------------------------------------------- */
/* The member's own view (GET /api/me/profile)                               */
/* ------------------------------------------------------------------------- */

export const profileTraitViewSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
  source: z.enum(['clinician', 'onboarding', 'companion', 'system', 'derived']),
  observedAt: z.string(),
});

/** What a member sees about themselves on /welcome: names, goal, segment, traits, and their intake state. */
export const memberProfileViewSchema = z.object({
  memberId: z.string().uuid(),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  goal: z.string().nullable(),
  goalLabel: z.string().nullable(),
  segment: z.string().nullable(),
  /** Marketing and personal tier traits only; health arrives with the PHI keys. */
  traits: z.array(profileTraitViewSchema),
  /** The member's intake session, when there is one. */
  intake: sessionStateSchema.nullable(),
});
export type MemberProfileView = z.infer<typeof memberProfileViewSchema>;

export const claimResultSchema = z.object({
  memberId: z.string().uuid(),
  alreadyClaimed: z.boolean(),
  state: sessionStateSchema,
});
export type ClaimResult = z.infer<typeof claimResultSchema>;
