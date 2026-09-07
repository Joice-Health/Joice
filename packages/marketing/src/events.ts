/**
 * Every Attentive custom event type, in one place. Attentive creates event
 * types on first use, so a casing typo in one adapter silently forks an event
 * and breaks the journeys built on it; adapters must reference these
 * constants, never inline strings. Event names are a platform-namespace
 * concern, which is why they live here rather than in any one domain.
 * Attentive forbids `" ' () {} [] \ | ,` in a type name; events.test.ts pins it.
 */
export const EVENTS = {
  joinedWaitlist: 'Joined Waitlist',
  waitlistStatusChanged: 'Waitlist Status Changed',
  /** Onboarding: "tell me when my state opens" (no subscription). */
  serviceAreaRequested: 'Service Area Requested',
  /** Onboarding: intake finished and the account exists. */
  onboardingCompleted: 'Onboarding Completed',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
