/**
 * Public runtime config. These are inlined at build time by Next, so they must be
 * referenced as full `process.env.NEXT_PUBLIC_*` literals (not computed keys).
 */
export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/** Build the public referral share link for a given code. */
export function buildShareUrl(referralCode: string): string {
  return `${appUrl}/waitlist?ref=${encodeURIComponent(referralCode)}`;
}
