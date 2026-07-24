import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
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
 * When member auth ships, this middleware verifies the Clerk token and sets
 * `memberId`; the session id keeps working alongside it so a thread started
 * before signing in can be claimed afterwards (`conversationService.claim`).
 * Nothing downstream needs to change — handlers already take a `Requester`.
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

  c.set('requester', { memberId: null, sessionId });
  return next();
};
