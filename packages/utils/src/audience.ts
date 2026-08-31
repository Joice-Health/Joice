/**
 * The four lifecycle stages anyone interacting with Joice is at, ordered:
 * each tier includes everyone at the tiers above it in this list. This is
 * the universal vocabulary across the apps (chosen 2026-08-31, epic 244);
 * do not invent parallel stage words elsewhere.
 *
 * - visitor: anonymous, nothing known about them.
 * - lead: shared an email (the companion capture or a future funnel).
 * - user: has a signed-in account (a Clerk member).
 * - subscriber: user with an active subscription.
 */
export const AUDIENCE_TIERS = ['visitor', 'lead', 'user', 'subscriber'] as const;

export type AudienceTier = (typeof AUDIENCE_TIERS)[number];

export const AUDIENCE_TIER_LABELS: Record<AudienceTier, string> = {
  visitor: 'Visitor',
  lead: 'Lead',
  user: 'User',
  subscriber: 'Subscriber',
};

/** Is `tier` at or above `minimum` in the lifecycle order? */
export function tierAtLeast(tier: AudienceTier, minimum: AudienceTier): boolean {
  return AUDIENCE_TIERS.indexOf(tier) >= AUDIENCE_TIERS.indexOf(minimum);
}
