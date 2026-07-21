/**
 * Public runtime config. These are inlined at build time by Next, so they must be
 * referenced as full `process.env.NEXT_PUBLIC_*` literals (not computed keys).
 */
export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/**
 * Where the brain service lives.
 *
 * In production and in Docker this is the same origin as the API — CloudFront
 * serves one origin and the ALB routes `/api/brain/*` to the brain service — so
 * this is left unset and falls back to `apiUrl`. It exists for running both dev
 * servers directly on the host, where the brain is on its own port.
 */
export const brainUrl = process.env.NEXT_PUBLIC_BRAIN_URL || apiUrl;

/** Build the public referral share link for a given code. */
export function buildShareUrl(referralCode: string): string {
  return `${appUrl}/waitlist?ref=${encodeURIComponent(referralCode)}`;
}
