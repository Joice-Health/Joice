/**
 * Shared-password preview gate helpers. The team cookie's value is an HMAC of a
 * fixed message keyed by TEAM_PASSWORD — unforgeable without the password, and
 * rotating the password invalidates every issued cookie at once.
 *
 * Uses Web Crypto only, so it runs in both middleware and route handlers.
 */

export const TEAM_COOKIE = 'joice_team';
export const TEAM_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const COOKIE_MESSAGE = 'joice-team-v1';

export async function expectedCookieValue(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(COOKIE_MESSAGE));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function isValidTeamCookie(
  cookieValue: string | undefined,
  password: string | undefined,
): Promise<boolean> {
  if (!cookieValue || !password) return false;
  return cookieValue === (await expectedCookieValue(password));
}

export function siteLaunched(): boolean {
  return process.env.SITE_LAUNCHED === 'true';
}
