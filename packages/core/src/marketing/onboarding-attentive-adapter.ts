import { EVENTS, type AttentiveClient, type AttentiveUser } from '@joice/marketing';
import type { OnboardingMarketingPort } from '../onboarding/marketing-port';

/**
 * Maps the onboarding marketing port onto the shared Attentive client.
 * Properties are namespaced `onboarding_*` (the waitlist owns `referral_*`,
 * the brain `lead_*`), no clientUserId is ever sent (the waitlist owns that
 * slot), and the only subscription is the one the person asked for on the
 * consent step.
 */
export function createOnboardingAttentiveAdapter(
  client: AttentiveClient,
  opts: { signUpSourceId: string },
): OnboardingMarketingPort {
  function userOf(profile: { email: string; phone?: string | null }): AttentiveUser {
    return { email: profile.email, ...(profile.phone ? { phone: profile.phone } : {}) };
  }

  return {
    async serviceAreaRequested(profile) {
      const user = userOf(profile);
      await client.upsertProfile({
        user,
        firstName: profile.firstName,
        properties: {
          onboarding_state: profile.stateCode,
          onboarding_state_requested_at: profile.requestedAt.toISOString(),
          ...(profile.goal ? { onboarding_goal: profile.goal } : {}),
        },
      });
      await client.trackEvent(
        EVENTS.serviceAreaRequested,
        user,
        { onboarding_state: profile.stateCode },
        { externalEventId: `${profile.email}:${profile.stateCode}`, occurredAt: profile.requestedAt },
      );
    },

    async intakeCompleted(profile) {
      const user = userOf(profile);
      await client.upsertProfile({
        user,
        firstName: profile.firstName,
        properties: {
          ...(profile.goal ? { onboarding_goal: profile.goal } : {}),
          ...(profile.segment ? { onboarding_segment: profile.segment } : {}),
          ...(profile.stateCode ? { onboarding_state: profile.stateCode } : {}),
          onboarding_completed_at: profile.completedAt.toISOString(),
          onboarding_marketing_consent: profile.consentMarketing,
        },
      });
      if (profile.consentMarketing) {
        await client.subscribe({ user, signUpSourceId: opts.signUpSourceId });
      }
      await client.trackEvent(
        EVENTS.onboardingCompleted,
        user,
        {
          ...(profile.goal ? { onboarding_goal: profile.goal } : {}),
          ...(profile.segment ? { onboarding_segment: profile.segment } : {}),
        },
        { externalEventId: profile.eventId, occurredAt: profile.completedAt },
      );
    },
  };
}
