import { METRICS, type KlaviyoClient } from '@joice/marketing';
import type { OnboardingMarketingPort } from '../onboarding/marketing-port';

/** Consent provenance recorded on the Klaviyo subscription (audit trail). */
const CONSENT_SOURCE = 'Joice intake opt-in';

/**
 * Maps the onboarding marketing port onto the shared Klaviyo client. Properties
 * are namespaced `onboarding_*` (the waitlist owns `referral_*`, the brain
 * `lead_*`), no external_id is ever sent, and the only list subscription is
 * the one the person asked for on the consent step.
 */
export function createOnboardingKlaviyoAdapter(
  client: KlaviyoClient,
  opts: { listId?: string },
): OnboardingMarketingPort {
  return {
    async serviceAreaRequested(profile) {
      await client.importProfile({
        email: profile.email,
        firstName: profile.firstName,
        properties: {
          onboarding_state: profile.stateCode,
          onboarding_state_requested_at: profile.requestedAt.toISOString(),
          ...(profile.goal ? { onboarding_goal: profile.goal } : {}),
        },
      });
      await client.trackEvent(
        METRICS.serviceAreaRequested,
        profile.email,
        { onboarding_state: profile.stateCode },
        `${profile.email}:${profile.stateCode}`,
      );
    },

    async intakeCompleted(profile) {
      await client.importProfile({
        email: profile.email,
        firstName: profile.firstName,
        properties: {
          ...(profile.goal ? { onboarding_goal: profile.goal } : {}),
          ...(profile.segment ? { onboarding_segment: profile.segment } : {}),
          ...(profile.stateCode ? { onboarding_state: profile.stateCode } : {}),
          onboarding_completed_at: profile.completedAt.toISOString(),
          onboarding_marketing_consent: profile.consentMarketing,
        },
      });
      if (profile.consentMarketing && opts.listId) {
        await client.subscribeToList(opts.listId, profile.email, CONSENT_SOURCE);
      }
      await client.trackEvent(
        METRICS.onboardingCompleted,
        profile.email,
        {
          ...(profile.goal ? { onboarding_goal: profile.goal } : {}),
          ...(profile.segment ? { onboarding_segment: profile.segment } : {}),
        },
        profile.eventId,
      );
    },
  };
}
