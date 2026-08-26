/**
 * Every Klaviyo metric name, in one place. Klaviyo creates metrics on first
 * use, so a casing typo in one adapter silently forks a metric and breaks the
 * flows built on it — adapters must reference these constants, never inline
 * strings. Metric names are a platform-namespace concern, which is why they
 * live here rather than in any one domain.
 */
export const METRICS = {
  joinedWaitlist: 'Joined Waitlist',
  waitlistStatusChanged: 'Waitlist Status Changed',
  /** Onboarding: "tell me when my state opens" (no list subscription). */
  serviceAreaRequested: 'Service Area Requested',
  /** Onboarding: intake finished and the account exists. */
  onboardingCompleted: 'Onboarding Completed',
} as const;

export type MetricName = (typeof METRICS)[keyof typeof METRICS];
