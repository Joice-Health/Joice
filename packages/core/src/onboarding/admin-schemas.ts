import { z } from 'zod';
import { US_STATE_CODES } from '@joice/utils';
import { flowDefinitionSchema } from './schemas';

/**
 * Admin contracts for the onboarding surface. Server-only (reached through the
 * `@joice/core` barrel like the other admin schemas); the admin UI types its
 * forms off the route chain.
 */

export const FLOW_VERSION_STATUSES = ['draft', 'published', 'archived'] as const;
export const flowVersionStatusSchema = z.enum(FLOW_VERSION_STATUSES);
export type FlowVersionStatus = z.infer<typeof flowVersionStatusSchema>;

export const createFlowVersionSchema = z
  .object({
    /** Copy this version; omit to copy the published one (or the default when none). */
    fromVersionId: z.string().uuid().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();
export type CreateFlowVersionInput = z.infer<typeof createFlowVersionSchema>;

export const updateFlowVersionSchema = z
  .object({
    definition: flowDefinitionSchema,
    notes: z.string().trim().max(500).optional(),
  })
  .strict();
export type UpdateFlowVersionInput = z.infer<typeof updateFlowVersionSchema>;

export const publishFlowVersionSchema = z.object({ notes: z.string().trim().max(500).optional() }).strict();
export type PublishFlowVersionInput = z.infer<typeof publishFlowVersionSchema>;

export const rollbackFlowSchema = z.object({ versionId: z.string().uuid() }).strict();
export type RollbackFlowInput = z.infer<typeof rollbackFlowSchema>;

export const SERVICE_AREA_STATUSES_ADMIN = ['open', 'notify', 'closed'] as const;
export const updateServiceAreaSchema = z
  .object({
    status: z.enum(SERVICE_AREA_STATUSES_ADMIN),
    note: z.string().trim().max(300).nullable().optional(),
  })
  .strict();
export type UpdateServiceAreaInput = z.infer<typeof updateServiceAreaSchema>;

export const stateCodeParamSchema = z.object({ code: z.enum(US_STATE_CODES) });

export const onboardingSettingsSchema = z
  .object({
    /** The age gate. 13..21 keeps a typo from opening the door to children or closing it to adults. */
    minimumAge: z.number().int().min(13).max(21),
  })
  .strict();
export type OnboardingSettings = z.infer<typeof onboardingSettingsSchema>;
export const onboardingSettingsPatchSchema = onboardingSettingsSchema.partial();
export type OnboardingSettingsPatch = z.infer<typeof onboardingSettingsPatchSchema>;
export const DEFAULT_ONBOARDING_SETTINGS: OnboardingSettings = { minimumAge: 18 };

export const simulateRequestSchema = z
  .object({
    versionId: z.string().uuid().optional(),
    definition: flowDefinitionSchema.optional(),
    /** Question key to value, answered in whatever order the engine asks. */
    persona: z.record(z.string(), z.unknown()),
    context: z
      .object({
        now: z.string().datetime().optional(),
        minimumAge: z.number().int().min(13).max(21).optional(),
        serviceAreaOverrides: z.record(z.enum(US_STATE_CODES), z.enum(SERVICE_AREA_STATUSES_ADMIN)).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => Boolean(v.versionId) !== Boolean(v.definition), {
    message: 'Pass exactly one of versionId or definition',
  });
export type SimulateRequest = z.infer<typeof simulateRequestSchema>;

export const funnelQuerySchema = z.object({
  versionId: z.string().uuid(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type FunnelQuery = z.infer<typeof funnelQuerySchema>;

export const serviceAreaRequestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  stateCode: z.enum(US_STATE_CODES).optional(),
});
export type ServiceAreaRequestsQuery = z.infer<typeof serviceAreaRequestsQuerySchema>;
