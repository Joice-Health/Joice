/**
 * Marketing port for the waitlist domain. A port describes the question asked
 * ("subscribe this person to waitlist marketing"), not the provider behind it:
 * core stays env-free and provider-free; the Attentive adapter is constructed
 * at the app edge (apps/api/src/services.ts) and injected. Tests inject a fake.
 *
 * Deliberately waitlist-shaped and waitlist-named: other domains (the brain's
 * lead capture, future orders) declare their own narrow ports over the same
 * `@joice/marketing` client rather than growing this one.
 */

export interface WaitlistMarketingProfile {
  /**
   * Waitlist entry id, sent as the marketing platform's client user id. The
   * waitlist OWNS that slot until a platform-wide person id exists; other
   * domains upsert by email only and must never send one.
   */
  id: string;
  email: string;
  /** E.164, once a surface collects one (none does yet; the adapters pass it through). */
  phone?: string | null;
  firstName: string | null;
  lastName: string | null;
  referralCode: string;
  referralCount: number;
  /** Monotonic signup order — a stored fact, unlike the derived `position`. */
  signupSequence: number;
  status: string;
  joinedAt: Date;
  wasReferred: boolean;
}

export interface WaitlistMarketingPort {
  /**
   * Upsert the profile AND subscribe it to waitlist marketing (email consent).
   * Fired once, when a signup first lands.
   */
  subscribeToWaitlist(profile: WaitlistMarketingProfile): Promise<void>;
  /**
   * Upsert profile fields only — no consent change. Used to keep a referrer's
   * referralCount fresh when someone they referred signs up.
   */
  updateProfile(profile: WaitlistMarketingProfile): Promise<void>;
  /**
   * Admin moved the entry through the lifecycle (pending → invited →
   * converted): refresh the profile AND record the checkpoint metric, so both
   * segments (on the property) and flows (on the metric) stay truthful.
   */
  statusChanged(profile: WaitlistMarketingProfile): Promise<void>;
}

/** A do-nothing implementation for tests and unwired callers. */
export const noopWaitlistMarketingPort: WaitlistMarketingPort = {
  async subscribeToWaitlist() {},
  async updateProfile() {},
  async statusChanged() {},
};
