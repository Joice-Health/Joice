import { z } from 'zod';
import { brainSettingsPatchSchema } from '../config/schemas';

/**
 * Wire contracts for the eval console. Browser-safe: the admin pages validate
 * and type against exactly what the brain's eval routes validate against.
 */

/** Cost rail: a run executes at most this many enabled cases. */
export const MAX_ENABLED_CASES = 100;

export const evalCaseInputSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  expectSources: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  expectRefusal: z.boolean().default(false),
  expectTool: z.string().trim().min(1).max(100).optional(),
  mustCite: z.boolean().default(false),
  enabled: z.boolean().default(true),
  tags: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
  notes: z.string().trim().max(2000).optional(),
});
export type EvalCaseInput = z.infer<typeof evalCaseInputSchema>;

export const evalCasePatchSchema = evalCaseInputSchema.partial();
export type EvalCasePatch = z.infer<typeof evalCasePatchSchema>;

export const evalRunModeSchema = z.enum(['retrieval', 'full']);
export type EvalRunMode = z.infer<typeof evalRunModeSchema>;

/**
 * Starting a run: the mode, plus optional overrides applied on top of the
 * stored settings for THIS RUN ONLY. Reuses the settings patch schema so an
 * admin can experiment with anything the settings page can change (model,
 * retrieval knobs, tool mode, even persona) without touching live config.
 */
export const startEvalRunSchema = z.object({
  mode: evalRunModeSchema,
  overrides: brainSettingsPatchSchema.default({}),
});
export type StartEvalRunInput = z.infer<typeof startEvalRunSchema>;

export const evalRunsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type EvalRunsQuery = z.infer<typeof evalRunsQuerySchema>;

export const evalIdParamSchema = z.object({ id: z.string().uuid() });
