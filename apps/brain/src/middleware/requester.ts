import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { getAuth } from '@hono/clerk-auth';
import type { Requester } from '@joice/brain';
import { env } from '../env';

/**
 * Identifies who is asking.
 *
 * Today that's always anonymous, so it's a random opaque id in a cookie — long
 * enough not to collide, meaningless on its own, and explicitly **not** derived
 * from an IP or user agent, which would make it a fingerprint and a compliance
 * problem rather than a session handle.
 *
 * Member auth: `clerkMiddleware` (app.ts) verifies a bearer token when the
 * browser sends one, and this middleware reads the member id from the
 * token's `metadata.memberId` claim (our users.id, stamped by the api on the
 * member's first call after sign-up). The session id keeps working alongside
 * it so a thread or lead started before signing in can be claimed afterwards
 * (`profileService.claim`, `conversationService.claim`). Nothing downstream
 * needs to change: handlers already take a `Requester`.
 */

const COOKIE = 'joice_brain_session';
/** A year. The thread is the point; expiring it monthly would defeat it. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface RequesterVariables {
  requester: Requester;
}

export const identifyRequester: MiddlewareHandler<{ Variables: RequesterVariables }> = async (
  c,
  next,
) => {
  let sessionId = getCookie(c, COOKIE);

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    setCookie(c, COOKIE, sessionId, {
      httpOnly: true,
      // Production: web and brain share one CloudFront origin, so Lax is correct
      // and safest. Dev: they're different origins (:3000 → :4100), which needs
      // SameSite=None to send the cookie on cross-origin fetches — and None
      // requires Secure, which browsers honour on localhost even over http.
      sameSite: env.NODE_ENV === 'production' ? 'Lax' : 'None',
      secure: true,
      path: '/',
      maxAge: MAX_AGE_SECONDS,
    });
  }

  c.set('requester', { memberId: memberIdFromClerk(c), sessionId });
  return next();
};

/** The member id Clerk's session token carries, or null when anonymous or unverified. */
function memberIdFromClerk(c: Parameters<MiddlewareHandler>[0]): string | null {
  try {
    const auth = getAuth(c);
    if (!auth?.userId) return null;
    const memberId = (auth.sessionClaims as { metadata?: { memberId?: unknown } } | undefined)?.metadata?.memberId;
    return typeof memberId === 'string' && /^[0-9a-f-]{36}$/.test(memberId) ? memberId : null;
  } catch {
    // No clerkMiddleware ran (a route outside /api/brain/*, or a test app): anonymous.
    return null;
  }
}
