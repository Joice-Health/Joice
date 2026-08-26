import { type Database, appSettings, eq } from '@joice/db';
import type { AuditService } from '../admin/audit-service';
import type { AdminActor } from '../admin/schemas';
import {
  DEFAULT_ONBOARDING_SETTINGS,
  onboardingSettingsPatchSchema,
  type OnboardingSettings,
  type OnboardingSettingsPatch,
} from './admin-schemas';

export const ONBOARDING_SETTINGS_KEY = 'onboarding';

export interface OnboardingConfigOptions {
  cacheTtlMs?: number;
  now?: () => number;
}

/**
 * The onboarding settings row (`app_settings.key = 'onboarding'`): today only
 * the minimum age. Same shape as the brain config service: one row holding a
 * partial patch, safeParse'd and merged onto code defaults so a stale or
 * invalid row can never break the age gate (it falls back to 18), cached ~30s,
 * every write audited as `onboarding.settings` on its own entity so gate
 * changes never hide among flow edits.
 */
export function createOnboardingConfigService(
  db: Database,
  audit: AuditService,
  { cacheTtlMs = 30_000, now = () => Date.now() }: OnboardingConfigOptions = {},
) {
  let cache: { value: OnboardingSettings; expiresAt: number } | undefined;
  const invalidate = () => {
    cache = undefined;
  };

  const resolve = (stored: unknown): OnboardingSettings => {
    const parsed = onboardingSettingsPatchSchema.safeParse(stored ?? {});
    const overrides: OnboardingSettingsPatch = parsed.success ? parsed.data : {};
    return {
      ...DEFAULT_ONBOARDING_SETTINGS,
      ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)),
    };
  };

  async function readStored(): Promise<unknown> {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, ONBOARDING_SETTINGS_KEY)).limit(1);
    return row?.value;
  }

  return {
    async get(): Promise<OnboardingSettings> {
      if (cache && cache.expiresAt > now()) return cache.value;
      const value = resolve(await readStored());
      cache = { value, expiresAt: now() + cacheTtlMs };
      return value;
    },

    async getStored(): Promise<OnboardingSettingsPatch> {
      const parsed = onboardingSettingsPatchSchema.safeParse((await readStored()) ?? {});
      return parsed.success ? parsed.data : {};
    },

    async update(patch: OnboardingSettingsPatch, actor: AdminActor): Promise<OnboardingSettings> {
      const next = await db.transaction(async (tx) => {
        const [row] = await tx.select().from(appSettings).where(eq(appSettings.key, ONBOARDING_SETTINGS_KEY)).limit(1);
        const before = resolve(row?.value);
        const merged = { ...(onboardingSettingsPatchSchema.safeParse(row?.value ?? {}).data ?? {}), ...patch };
        await tx
          .insert(appSettings)
          .values({ key: ONBOARDING_SETTINGS_KEY, value: merged, description: 'Onboarding: the age gate minimum' })
          .onConflictDoUpdate({ target: appSettings.key, set: { value: merged, updatedAt: new Date() } });
        const after = resolve(merged);
        await audit.record(
          {
            actorClerkUserId: actor.clerkUserId,
            actorEmail: actor.email,
            action: 'onboarding.settings',
            entityType: 'onboarding_settings',
            entityId: ONBOARDING_SETTINGS_KEY,
            before,
            after,
          },
          tx,
        );
        return after;
      });
      invalidate();
      return next;
    },
  };
}

export type OnboardingConfigService = ReturnType<typeof createOnboardingConfigService>;
