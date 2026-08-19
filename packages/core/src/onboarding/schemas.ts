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
export const CONSENT_SECTION_KEY = 'consent';
