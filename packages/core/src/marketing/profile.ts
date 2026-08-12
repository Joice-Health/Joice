import type { WaitlistEntry } from '@joice/db';
import type { WaitlistMarketingProfile } from './port';

/**
 * The single row→profile mapping, shared by every service that syncs (public
 * join, admin status changes). Field drift between two copies of this mapping
 * would silently diverge Klaviyo from the database — never duplicate it.
 *
 * Deliberately excludes `ipHash` (never leaves the database), `referredByCode`
 * (raw unresolved codes are noise), and `metadata`.
 */
export function toWaitlistMarketingProfile(entry: WaitlistEntry): WaitlistMarketingProfile {
  return {
    id: entry.id,
    email: entry.email,
    firstName: entry.firstName,
    lastName: entry.lastName,
    referralCode: entry.referralCode,
    referralCount: entry.referralCount,
    signupSequence: entry.sequence,
    status: entry.status,
    joinedAt: entry.createdAt,
    wasReferred: entry.referredById !== null,
  };
}
