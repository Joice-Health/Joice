import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

/**
 * Identifies the intake session: an opaque random id in an httpOnly cookie,
 * the same shape as the brain's `joice_brain_session` and kept separate from
 * it on purpose (platform identity is not brain identity). Not derived from
 * IP or user agent, so it is a session handle, not a fingerprint. A year
 * long because resuming is the point; retention is enforced on the session
 * row (the sweep), not on the cookie.
 */
export const ONBOARDING_COOKIE = 'joice_onboarding_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface OnboardingSessionVariables {
  onboardingSessionId: string;
}

/**
 * `production` picks the SameSite policy. Prod: web and api share one
 * CloudFront origin, Lax is right. Dev: the web (:3000) and the api (:4000) are
 * different origins, which needs SameSite=None (and therefore Secure, which
 * browsers honour on localhost even over http) plus `credentials: 'include'`
 * on the client.
 */
export function createOnboardingSessionMiddleware(opts: {
  production: boolean;
}): MiddlewareHandler<{ Variables: OnboardingSessionVariables }> {
  return async (c, next) => {
    let id = getCookie(c, ONBOARDING_COOKIE);
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      id = crypto.randomUUID();
      setCookie(c, ONBOARDING_COOKIE, id, {
        httpOnly: true,
        sameSite: opts.production ? 'Lax' : 'None',
        secure: true,
        path: '/',
        maxAge: MAX_AGE_SECONDS,
      });
    }
    c.set('onboardingSessionId', id);
    return next();
  };
}
