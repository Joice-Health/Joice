import { getDatabase } from '@joice/db';
import {
  createAdminWaitlistService,
  createAuditService,
  createFeatureFlagService,
  createLeadsService,
  createSettingsService,
  createUserService,
  createWaitlistService,
} from '@joice/core';
import { createBrainConfigService } from '@joice/brain';
import { env } from './env';

/** Single service graph over the shared DB client, reused across routes. */
const db = getDatabase();

export const waitlist = createWaitlistService(db);
export const audit = createAuditService(db);
export const adminWaitlist = createAdminWaitlistService(db, audit);
export const userService = createUserService(db, audit);
export const featureFlags = createFeatureFlagService(db, audit);
export const settings = createSettingsService(db, audit);

/**
 * Read-only view of the companion's pre-onboarding leads. Reads the brain-owned
 * `brain_profiles` table — a documented boundary exception, see the service.
 */
export const leads = createLeadsService(db);

/**
 * The admin console owns *writes* to the brain settings; the brain service
 * reads them. This is the one piece of the brain that stays here, because the
 * write path needs the audit trail and the Clerk actor, both of which live on
 * this side. It touches only the shared `app_settings` row — never the brain's
 * own tables.
 */
export const brainConfig = createBrainConfigService(db, audit, {
  envDefaults: { model: env.RAG_MODEL, pollyVoiceId: env.POLLY_VOICE_ID },
});
