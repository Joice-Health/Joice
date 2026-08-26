/**
 * Marketing port for the onboarding domain. Narrow and onboarding-shaped, like
 * the waitlist's: it never sends an external_id (the waitlist owns that slot),
 * it upserts by email only, and it subscribes to a list only when the person
 * opted in. The Klaviyo adapter lives next to the waitlist's; the api wires it
 * at the edge and tests inject the noop.
 */

export interface ServiceAreaRequestedProfile {
  email: string;
  firstName: string | null;
  stateCode: string;
  /** The goal they had chosen, if the gate came after it (it does not today). */
  goal: string | null;
  requestedAt: Date;
}

export interface IntakeCompletedProfile {
  email: string;
  firstName: string | null;
  goal: string | null;
  segment: string | null;
  stateCode: string | null;
  /** Only with this true does the adapter subscribe the email to a list. */
  consentMarketing: boolean;
  completedAt: Date;
  /** Unique per member, so a retried claim never double-fires the event. */
  eventId: string;
}

export interface OnboardingMarketingPort {
  /** "Tell me when my state opens": profile + event, no list subscription. */
  serviceAreaRequested(profile: ServiceAreaRequestedProfile): Promise<void>;
  /** Intake finished and the account exists: profile + event, list only on opt-in. */
  intakeCompleted(profile: IntakeCompletedProfile): Promise<void>;
}

export const noopOnboardingMarketingPort: OnboardingMarketingPort = {
  async serviceAreaRequested() {},
  async intakeCompleted() {},
};
