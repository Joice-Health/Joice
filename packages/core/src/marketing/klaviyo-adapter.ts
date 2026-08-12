import { METRICS, type KlaviyoClient } from '@joice/marketing';
import type { WaitlistMarketingPort, WaitlistMarketingProfile } from './port';

/** Consent provenance recorded on the Klaviyo subscription (audit trail). */
const CONSENT_SOURCE = 'Joice waitlist signup';

/**
 * Maps the waitlist's marketing port onto the shared Klaviyo client:
 * profile upsert → list subscribe (consent) → 'Joined Waitlist' event.
 * Events carry a unique_id derived from the entry so a retried or re-pushed
 * sync can never double-fire a flow. Future checkpoints (onboarding steps,
 * etc.) follow this same trackEvent pattern from their own domain ports,
 * with no changes here.
 */
export function createKlaviyoMarketingAdapter(
  client: KlaviyoClient,
  opts: { listId: string },
): WaitlistMarketingPort {
  function importProfile(profile: WaitlistMarketingProfile): Promise<void> {
    return client.importProfile({
      email: profile.email,
      externalId: profile.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      properties: {
        referral_code: profile.referralCode,
        referral_count: profile.referralCount,
        signup_sequence: profile.signupSequence,
        waitlist_status: profile.status,
        joined_waitlist_at: profile.joinedAt.toISOString(),
      },
    });
  }

  return {
    async subscribeToWaitlist(profile) {
      await importProfile(profile);
      await client.subscribeToList(opts.listId, profile.email, CONSENT_SOURCE);
      await client.trackEvent(
        METRICS.joinedWaitlist,
        profile.email,
        { referral_code: profile.referralCode, was_referred: profile.wasReferred },
        profile.id,
      );
    },

    async updateProfile(profile) {
      await importProfile(profile);
    },

    async statusChanged(profile) {
      await importProfile(profile);
      await client.trackEvent(
        METRICS.waitlistStatusChanged,
        profile.email,
        { waitlist_status: profile.status },
        // One event per entry per status — re-pushing the same transition is a no-op.
        `${profile.id}:${profile.status}`,
      );
    },
  };
}
