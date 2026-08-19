/**
 * Onboarding retention, the sweep the intake's privacy posture promises
 * (docs/onboarding/07-compliance.md): an in-progress session idle past the
 * idle window becomes `abandoned`; an unclaimed session (any status but
 * `registered`) untouched past the TTL loses its answers, its observations,
 * its projected profile and its row. Registered sessions never expire, and a
 * member's erasure is the per-person path, never a blanket sweep.
 *
 * Runs nightly as a scheduled ECS task (infra/onboarding-retention.tf) with
 * the api image, and by hand:
 *
 *   ONBOARDING_RETENTION_DRY_RUN=true bun apps/api/scripts/onboarding-retention.ts
 *
 * Dry-run reports what would be purged and writes nothing. Batched so a large
 * backlog cannot hold a transaction open for minutes.
 */
import { z } from 'zod';
import { createDatabase } from '@joice/db';
import {
  createDbSessionStore,
  createOnboardingService,
  createProfileService,
  type OnboardingService,
} from '@joice/core';

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    ONBOARDING_SESSION_IDLE_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    ONBOARDING_SESSION_TTL_DAYS: z.coerce.number().int().min(7).max(3650).default(90),
    ONBOARDING_RETENTION_DRY_RUN: z
      .string()
      .default('false')
      .transform((v) => v === 'true' || v === '1'),
  })
  .parse(process.env);

if (env.ONBOARDING_SESSION_TTL_DAYS <= env.ONBOARDING_SESSION_IDLE_DAYS) {
  console.error('ONBOARDING_SESSION_TTL_DAYS must be larger than ONBOARDING_SESSION_IDLE_DAYS');
  process.exit(1);
}

const db = createDatabase(env.DATABASE_URL);
const profiles = createProfileService(db);

/**
 * The sweep only needs the session store and the profile service; the rest of
 * the service's dependencies never run on this path, so they are stubs that
 * throw if reached (loudly wrong beats quietly wrong).
 */
const never = (what: string) => () => {
  throw new Error(`${what} must not run during retention`);
};
const onboarding: OnboardingService = createOnboardingService({
  sessions: createDbSessionStore(db),
  profiles,
  flows: { getPublished: never('flows.getPublished'), getVersion: never('flows.getVersion') },
  serviceAreas: { map: never('serviceAreas.map') },
  config: { get: never('config.get') },
  events: { record: async () => {} },
  requests: { request: never('requests.request') },
});

const { abandoned, purged } = await onboarding.sweep({
  idleDays: env.ONBOARDING_SESSION_IDLE_DAYS,
  purgeDays: env.ONBOARDING_SESSION_TTL_DAYS,
  dryRun: env.ONBOARDING_RETENTION_DRY_RUN,
});

console.log(
  env.ONBOARDING_RETENTION_DRY_RUN
    ? `🔎 Retention dry-run: would purge ${purged} unclaimed session(s) older than ${env.ONBOARDING_SESSION_TTL_DAYS} days (nothing written).`
    : `✅ Retention: marked ${abandoned} idle session(s) abandoned (${env.ONBOARDING_SESSION_IDLE_DAYS}-day window); purged ${purged} unclaimed session(s) with their answers, observations and profiles (${env.ONBOARDING_SESSION_TTL_DAYS}-day TTL).`,
);
process.exit(0);
