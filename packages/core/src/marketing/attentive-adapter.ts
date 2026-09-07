import { EVENTS, type AttentiveClient, type AttentiveUser } from '@joice/marketing';
import type { WaitlistMarketingPort, WaitlistMarketingProfile } from './port';

/**
 * Maps the waitlist's marketing port onto the shared Attentive client:
 * profile upsert, then consent through the API sign-up unit, then the
 * 'Joined Waitlist' event. Events carry an externalEventId derived from the
 * entry so a retried or re-pushed sync can never double-fire a journey, and
 * occurredAt is the row's own time so a late re-push never starts a stale one.
 * Attribute types lock on first write (docs/marketing/01-attentive.md), so the
 * shapes here are deliberate: counts are numbers, timestamps ISO strings.
 * Future checkpoints follow this same trackEvent pattern from their own domain
 * ports, with no changes here.
 */
export function createAttentiveMarketingAdapter(
  client: AttentiveClient,
  opts: { signUpSourceId: string },
): WaitlistMarketingPort {
  /** The waitlist owns the clientUserId slot: the entry id, nobody else's. */
  function userOf(profile: WaitlistMarketingProfile): AttentiveUser {
    return {
      email: profile.email,
      ...(profile.phone ? { phone: profile.phone } : {}),
      clientUserId: profile.id,
    };
  }

  function upsert(profile: WaitlistMarketingProfile): Promise<void> {
    return client.upsertProfile({
      user: userOf(profile),
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
      const user = userOf(profile);
      await upsert(profile);
      await client.subscribe({ user, signUpSourceId: opts.signUpSourceId });
      await client.trackEvent(
        EVENTS.joinedWaitlist,
        user,
        { referral_code: profile.referralCode, was_referred: profile.wasReferred },
        { externalEventId: profile.id, occurredAt: profile.joinedAt },
      );
    },

    async updateProfile(profile) {
      await upsert(profile);
    },

    async statusChanged(profile) {
      await upsert(profile);
      await client.trackEvent(
        EVENTS.waitlistStatusChanged,
        userOf(profile),
        { waitlist_status: profile.status },
        // One event per entry per status: re-pushing the same transition is a no-op.
        { externalEventId: `${profile.id}:${profile.status}` },
      );
    },
  };
}
