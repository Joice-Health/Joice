import { appSettings, eq, type Database } from '@joice/db';
import {
  brainSettingsPatchSchema,
  brainSettingsSchema,
  DEFAULT_BRAIN_SETTINGS,
  type BrainSettings,
  type BrainSettingsPatch,
  type ResolvedBrainConfig,
} from './schemas';
import type { AuditPort, SettingsActor } from '../ports';

const BRAIN_SETTINGS_KEY = 'brain';

export interface BrainConfigOptions {
  /** Env fallbacks for the runtime-switchable fields. */
  envDefaults: { model: string; pollyVoiceId: string };
  cacheTtlMs?: number;
  now?: () => number;
}

/**
 * Runtime accessor + admin mutations for the brain settings row. Reads are
 * cached (~30s, same pattern as feature flags) so every chat request can
 * resolve config without a DB round-trip; mutations invalidate immediately on
 * this instance and converge within the TTL on others.
 *
 * Resilience: the stored row is safeParse'd and merged onto code defaults — a
 * partial, stale, or invalid row can never break chat.
 */
export function createBrainConfigService(
  db: Database,
  audit: AuditPort,
  { envDefaults, cacheTtlMs = 30_000, now = () => Date.now() }: BrainConfigOptions,
) {
  let cache: { value: ResolvedBrainConfig; expiresAt: number } | undefined;
  const invalidate = () => {
    cache = undefined;
  };

  const resolve = (stored: unknown): ResolvedBrainConfig => {
    const parsed = brainSettingsPatchSchema.safeParse(stored ?? {});
    // A corrupt row must not break chat, but since the tool-access fields
    // became part of this row, silently dropping EVERYTHING on one bad field
    // would also silently reopen every gate to 'visitor'. Salvage field by
    // field: keep every value that still validates, warn once about the rest.
    let overrides: BrainSettingsPatch = parsed.success ? parsed.data : {};
    if (!parsed.success && stored && typeof stored === 'object') {
      const salvaged: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(stored)) {
        const field = brainSettingsSchema.shape[key as keyof BrainSettings];
        if (field && field.safeParse(value).success) salvaged[key] = value;
      }
      console.warn(
        `brain settings row partially invalid; salvaged ${Object.keys(salvaged).length}/${Object.keys(stored).length} fields, rest fall back to defaults`,
      );
      overrides = salvaged as BrainSettingsPatch;
    }
    return {
      ...DEFAULT_BRAIN_SETTINGS,
      model: envDefaults.model,
      pollyVoiceId: envDefaults.pollyVoiceId,
      ...Object.fromEntries(
        Object.entries(overrides).filter(([, v]) => v !== undefined),
      ),
    } as ResolvedBrainConfig;
  };

  async function readStored(): Promise<unknown> {
    const [row] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, BRAIN_SETTINGS_KEY))
      .limit(1);
    return row?.value;
  }

  return {
    /** Resolved config (stored ?? defaults ?? env) — what chat consumes. Cached. */
    async get(): Promise<ResolvedBrainConfig> {
      if (cache && cache.expiresAt > now()) return cache.value;
      const value = resolve(await readStored());
      cache = { value, expiresAt: now() + cacheTtlMs };
      return value;
    },

    /** Raw stored overrides (for the admin form) — NOT merged with defaults. */
    async getStored(): Promise<BrainSettingsPatch> {
      const parsed = brainSettingsPatchSchema.safeParse((await readStored()) ?? {});
      return parsed.success ? parsed.data : {};
    },

    /** Merge a patch into the stored overrides (transactional + audited). */
    async update(patch: BrainSettingsPatch, actor: SettingsActor): Promise<ResolvedBrainConfig> {
      const result = await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(appSettings)
          .where(eq(appSettings.key, BRAIN_SETTINGS_KEY))
          .limit(1);

        const current = brainSettingsPatchSchema.safeParse(before?.value ?? {});
        const merged = brainSettingsPatchSchema.parse({
          ...(current.success ? current.data : {}),
          ...patch,
        });

        await tx
          .insert(appSettings)
          .values({
            key: BRAIN_SETTINGS_KEY,
            value: merged,
            description: 'Chatbot brain settings (managed via /admin/brain)',
          })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: { value: merged, updatedAt: new Date() },
          });

        await audit.record(
          {
            actorClerkUserId: actor.clerkUserId,
            actorEmail: actor.email,
            action: 'brain.update',
            entityType: 'app_setting',
            entityId: BRAIN_SETTINGS_KEY,
            before: before ? { value: before.value } : undefined,
            after: { value: merged },
          },
          tx,
        );

        return merged;
      });

      invalidate();
      return resolve(result);
    },

    /** Delete all overrides — back to code/env defaults (audited). */
    async reset(actor: SettingsActor): Promise<void> {
      await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(appSettings)
          .where(eq(appSettings.key, BRAIN_SETTINGS_KEY))
          .limit(1);
        if (!before) return;

        await tx.delete(appSettings).where(eq(appSettings.key, BRAIN_SETTINGS_KEY));

        await audit.record(
          {
            actorClerkUserId: actor.clerkUserId,
            actorEmail: actor.email,
            action: 'brain.reset',
            entityType: 'app_setting',
            entityId: BRAIN_SETTINGS_KEY,
            before: { value: before.value },
          },
          tx,
        );
      });
      invalidate();
    },
  };
}

export type BrainConfigService = ReturnType<typeof createBrainConfigService>;
