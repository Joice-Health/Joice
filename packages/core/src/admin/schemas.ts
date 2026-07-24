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

/**
 * Pre-onboarding leads captured by the companion. Read-only on the admin side.
 * The table is brain-owned; the api service reads it here as a documented
 * boundary exception (leads are marketing-grade data — see docs/rag/10).
 */
export const leadStatusSchema = z.enum(['capturing', 'exploring', 'ready', 'converted']);
export type LeadStatus = z.infer<typeof leadStatusSchema>;

export const adminLeadsQuerySchema = paginationQuerySchema.extend({
  status: leadStatusSchema.optional(),
  /** Only leads that chose to start their journey. */
  readyOnly: z.coerce.boolean().optional(),
});
export type AdminLeadsQuery = z.infer<typeof adminLeadsQuerySchema>;

/** The lead as the admin table shows it — no session ids or internal fields. */
export interface LeadView {
  id: string;
  name: string | null;
  email: string | null;
  goal: string | null;
  readyForOnboarding: boolean;
  status: LeadStatus;
  createdAt: Date;
  updatedAt: Date;
}

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
