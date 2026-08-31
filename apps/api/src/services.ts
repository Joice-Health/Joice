import { getDatabase } from '@joice/db';
import {
  FLAG_KEYS,
  createAdminWaitlistService,
  createAuditService,
  createDbSessionStore,
  createFeatureFlagService,
  createFlowService,
  createKlaviyoMarketingAdapter,
  createLeadsService,
  createOnboardingConfigService,
  createLabUploadsService,
  createProtocolRulesService,
  createOnboardingEventsService,
  createOnboardingKlaviyoAdapter,
  createOnboardingService,
  createProfileService,
  createServiceAreaRequestService,
  createServiceAreaService,
  createSettingsService,
  createUserService,
  createWaitlistService,
  noopSubscriptionPort,
  type PhiStatus,
} from '@joice/core';
import { createKlaviyoClient } from '@joice/marketing';
import { createBrainConfigService } from '@joice/brain';
import { env } from './env';
import { createCareportalsSubscriptions } from './commerce/careportals-subscriptions';
import { createS3LabPresign } from './member/labs-presign';

/** Single service graph over the shared DB client, reused across routes. */
const db = getDatabase();

/**
 * Unconfigured (local default) → undefined: signups work, nothing syncs.
 * env.ts guarantees both vars are set together, so checking one is enough.
 */
const klaviyo = env.KLAVIYO_API_KEY ? createKlaviyoClient({ apiKey: env.KLAVIYO_API_KEY }) : undefined;
const marketing = klaviyo ? createKlaviyoMarketingAdapter(klaviyo, { listId: env.KLAVIYO_LIST_ID }) : undefined;
console.log(`[api] Klaviyo waitlist sync: ${marketing ? 'enabled' : 'disabled (no keys set)'}`);

export const waitlist = createWaitlistService(db, { marketing });
export const audit = createAuditService(db);
export const adminWaitlist = createAdminWaitlistService(db, audit, { marketing });
export const userService = createUserService(db, audit);
/**
 * Subscriber detection over CarePortals; the noop (nobody subscribes) until
 * the CRM service-user credentials exist. Feeds the internal profile the
 * brain reads for the subscriber audience tier.
 */
export const subscriptions =
  env.CAREPORTALS_ORG && env.CAREPORTALS_CRM_USERNAME && env.CAREPORTALS_CRM_PASSWORD
    ? createCareportalsSubscriptions({
        organization: env.CAREPORTALS_ORG,
        username: env.CAREPORTALS_CRM_USERNAME,
        password: env.CAREPORTALS_CRM_PASSWORD,
      })
    : noopSubscriptionPort;
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

/* ------------------------------------------------------------------------- *
 * Onboarding (the intake flow) and the profile it builds. All of these write
 * only `packages/db/src/schema/onboarding.ts`; the brain reaches the profile
 * over HTTP. See docs/onboarding/00-plan.md.
 * ------------------------------------------------------------------------- */

/** Onboarding's own Klaviyo port: `onboarding_*` properties, list only on opt-in. */
const onboardingMarketing = klaviyo
  ? createOnboardingKlaviyoAdapter(klaviyo, { listId: env.KLAVIYO_LIST_ID })
  : undefined;

export const onboardingConfig = createOnboardingConfigService(db, audit);
export const protocolRules = createProtocolRulesService(db, audit);
export const serviceAreas = createServiceAreaService(db, audit);
export const serviceAreaRequests = createServiceAreaRequestService(db, { marketing: onboardingMarketing });
export const onboardingEvents = createOnboardingEventsService(db);
export const profiles = createProfileService(db);

/**
 * Both PHI keys: the Terraform-set env and the admin-visible flag. The flow
 * validator refuses health-tier questions unless both say yes; the admin
 * editor shows this state in its header, and the internal profile endpoint
 * widens to the health tier only when `unlocked` is true.
 */
export const phiStatus = async (): Promise<PhiStatus> => {
  const flag = (await featureFlags.evaluateAll())[FLAG_KEYS.onboardingHealth] === true;
  return { ready: env.PHI_READY, flag, unlocked: env.PHI_READY && flag };
};

const phiEnabled = async () => (await phiStatus()).unlocked;

export const flows = createFlowService(db, audit, { phiEnabled });

/**
 * The labs scaffold: rows in core, presigning here (the AWS SDK stays out of
 * core). Null while no bucket is configured; the routes answer 404 then,
 * exactly as they do while the PHI keys are off.
 */
export const labUploads = env.LABS_BUCKET
  ? createLabUploadsService(db, { presign: createS3LabPresign(env.LABS_BUCKET) })
  : null;

export const onboarding = createOnboardingService({
  sessions: createDbSessionStore(db),
  flows,
  profiles,
  serviceAreas,
  config: onboardingConfig,
  events: onboardingEvents,
  requests: serviceAreaRequests,
  marketing: onboardingMarketing,
});
