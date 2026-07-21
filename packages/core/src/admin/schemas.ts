import { z } from 'zod';

/* ------------------------------------------------------------------------- *
 * Admin contracts. Query params arrive as strings from Hono, hence z.coerce. *
 * ------------------------------------------------------------------------- */

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export const waitlistStatusSchema = z.enum(['pending', 'invited', 'converted']);
export type WaitlistStatus = z.infer<typeof waitlistStatusSchema>;

export const adminWaitlistQuerySchema = paginationQuerySchema.extend({
  /** Matches email / first / last name, case-insensitive. */
  search: z.string().trim().max(254).optional(),
  status: waitlistStatusSchema.optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

export type AdminWaitlistQuery = z.infer<typeof adminWaitlistQuerySchema>;

export const updateWaitlistEntrySchema = z.object({
  status: waitlistStatusSchema,
});

export type UpdateWaitlistEntryInput = z.infer<typeof updateWaitlistEntrySchema>;

export const userStatusSchema = z.enum(['active', 'suspended', 'deleted']);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const adminUserQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(254).optional(),
  status: userStatusSchema.optional(),
});

export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;

export const updateUserStatusSchema = z.object({
  status: userStatusSchema,
});

export const featureFlagKeySchema = z
  .string()
  .trim()
  .min(1, 'Enter a flag key')
  .max(100, 'Key is too long')
  .regex(/^[a-z0-9_.-]+$/, 'Lowercase letters, digits, _ . - only');

export const createFeatureFlagSchema = z.object({
  key: featureFlagKeySchema,
  description: z.string().trim().max(500).optional(),
  enabled: z.boolean().default(false),
});

export type CreateFeatureFlagInput = z.infer<typeof createFeatureFlagSchema>;

/** Key is immutable after create — only description/enabled can change. */
export const updateFeatureFlagSchema = z
  .object({
    description: z.string().trim().max(500).nullable(),
    enabled: z.boolean(),
  })
  .partial();

export type UpdateFeatureFlagInput = z.infer<typeof updateFeatureFlagSchema>;

export const settingKeySchema = z
  .string()
  .trim()
  .min(1, 'Enter a setting key')
  .max(100, 'Key is too long')
  .regex(/^[a-z0-9_.-]+$/, 'Lowercase letters, digits, _ . - only');

export const upsertSettingSchema = z.object({
  /** Arbitrary JSON — stored as jsonb. */
  value: z.unknown(),
  description: z.string().trim().max(500).optional(),
});

export type UpsertSettingInput = z.infer<typeof upsertSettingSchema>;

export const setAdminRoleSchema = z.object({
  clerkUserId: z.string().trim().min(1),
  /** `'admin'` grants, `null` revokes. */
  role: z.enum(['admin']).nullable(),
});

export type SetAdminRoleInput = z.infer<typeof setAdminRoleSchema>;

export const auditLogQuerySchema = paginationQuerySchema.extend({
  entityType: z.string().trim().max(100).optional(),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

/** Identity of the admin performing a mutation, recorded on every audit row. */
export interface AdminActor {
  clerkUserId: string;
  email?: string;
}

/* ------------------------------------------------------------------------- *
 * Brain settings — admin-managed chatbot behavior. Stored as ONE partial
 * app_settings row (key `brain`); anything unset falls back to code defaults,
 * so a stale or invalid row can never break chat. The safety floor (grounding,
 * not-medical-advice) is NOT here — it lives in code (prompt.ts) and cannot be
 * disabled from the admin.
 * ------------------------------------------------------------------------- */

export const brainSettingsSchema = z.object({
  /** Who the assistant is. */
  personaName: z.string().trim().min(1).max(60),
  personaDescription: z.string().trim().min(1).max(1000),
  toneInstructions: z.string().trim().max(2000),
  /** `natural` = talk like a person; never mention notes/documents/sources. */
  attributionStyle: z.enum(['cite-notes', 'natural']),
  /** Controls both the [n]-marker instruction and the UI chips. */
  showCitations: z.boolean(),

  /** Copy. */
  notCoveredMessage: z.string().trim().min(1).max(1000),
  clinicianHandoffMessage: z.string().trim().min(1).max(500),
  emptyStateHint: z.string().trim().min(1).max(300),
  inputPlaceholder: z.string().trim().min(1).max(200),
  disclaimer: z.string().trim().min(1).max(200),

  /** Guardrails (on top of the code-level safety floor). */
  restrictedTopics: z.array(z.string().trim().min(1).max(200)).max(20),
  customInstructions: z.string().trim().max(4000),

  /** Retrieval & generation. */
  topK: z.number().int().min(1).max(20),
  similarityFloor: z.number().min(0).max(1),
  maxAnswerTokens: z.number().int().min(128).max(4096),
  /** Rewrite follow-up questions into standalone search queries using the conversation. */
  queryRewriting: z.boolean(),
  /** Small/fast Bedrock model used for the rewrite. */
  rewriteModel: z.string().trim().min(1).max(200),

  /** Runtime-switchable model/voice; unset = env defaults (RAG_MODEL / POLLY_VOICE_ID). */
  model: z.string().trim().min(1).max(200),
  pollyVoiceId: z.string().trim().min(1).max(50),
});

export type BrainSettings = z.infer<typeof brainSettingsSchema>;

/** What's stored / PUT — any subset of the fields. */
export const brainSettingsPatchSchema = brainSettingsSchema.partial();
export type BrainSettingsPatch = z.infer<typeof brainSettingsPatchSchema>;

/** Everything resolved (stored ?? default ?? env) — what the chat runtime consumes. */
export type ResolvedBrainConfig = BrainSettings;

/** Code defaults = today's behavior. Model/voice defaults come from env at resolve time. */
export const DEFAULT_BRAIN_SETTINGS: Omit<BrainSettings, 'model' | 'pollyVoiceId'> = {
  personaName: 'Joice',
  personaDescription:
    "Joice's peptide knowledge assistant, answering members' questions about peptides and protocols",
  toneInstructions: 'Be specific and practical; use plain language and keep answers focused.',
  attributionStyle: 'cite-notes',
  showCitations: true,
  notCoveredMessage:
    "I don't have information about that in our clinical reference notes, so I can't " +
    'give you a grounded answer. Try rephrasing, or ask about a specific peptide or ' +
    'protocol we cover.',
  clinicianHandoffMessage:
    'Our clinical team handles that during consultation.',
  emptyStateHint:
    'Ask anything about the peptides and protocols in our clinical notes — answers cite the exact source they came from. Tap the mic to ask out loud.',
  inputPlaceholder: 'e.g. What does the clinical team say about BPC-157 dosing?',
  disclaimer: 'Educational information from our clinical notes — not medical advice',
  restrictedTopics: [],
  customInstructions: '',
  topK: 8,
  similarityFloor: 0.4,
  maxAnswerTokens: 1024,
  queryRewriting: true,
  rewriteModel: 'us.amazon.nova-lite-v1:0',
};
