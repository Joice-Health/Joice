import { Hono } from 'hono';
import { clerkMiddleware } from '@hono/clerk-auth';
import { zValidator } from '@hono/zod-validator';
import {
  FLAG_KEYS,
  OnboardingServiceError,
  answerSchema,
  claimSchema,
  notifyRequestSchema,
  skipSchema,
  startSessionSchema,
  type ActionResult,
} from '@joice/core';
import { env } from '../env';
import { hashIp } from '../hash';
import { requireMember } from '../member';
import type { MemberVariables } from '../member/auth';
import { requireFlag } from '../middleware/feature-gate';
import {
  createOnboardingSessionMiddleware,
  type OnboardingSessionVariables,
} from '../middleware/onboarding-session';
import { clientIp, rateLimit } from '../middleware/rate-limit';
import { featureFlags, onboarding } from '../services';

export type OnboardingEnv = { Variables: OnboardingSessionVariables };
type ClaimEnv = { Variables: OnboardingSessionVariables & MemberVariables };

/**
 * The public intake API: the visitor's session, driven by the engine on the
 * server. Everything here is anonymous (the cookie is the session handle),
 * flag-gated (`onboarding`, seeded off: the whole surface answers 404 until an
 * admin opens it), and rate-limited per IP. Claim (member-authenticated) and
 * the member profile arrive with the registration stories.
 *
 * A rejected action answers with `{ error, code, questionKey? }`: 404 when the
 * visitor has no session, 409 when the session is gated (or not gated, for
 * notify), 400 for a bad or out-of-turn answer. The client branches on `code`.
 */
const onboardingOpen = requireFlag(featureFlags, FLAG_KEYS.onboarding, "Intake isn't open yet.");
const session = createOnboardingSessionMiddleware({ production: env.NODE_ENV === 'production' });

/**
 * Claim: link this browser's intake session to the signed-in member. Its own
 * sub-router because it alone needs Clerk on top of the cookie. Verified email
 * only (409 otherwise), idempotent for the same member, refused for another
 * (403), refused for a gated session (409). `requireMember` creates the
 * member's record if this is their first call after sign-up.
 */
const claimRoutes = new Hono<ClaimEnv>()
  .use('*', rateLimit({ windowMs: 60_000, max: 10 }))
  .use('*', clerkMiddleware({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.CLERK_PUBLISHABLE_KEY }))
  .use('*', requireMember)
  .post('/', zValidator('json', claimSchema), async (c) => {
    try {
      const { state, alreadyClaimed } = await onboarding.claim({
        anonymousSessionId: c.get('onboardingSessionId'),
        member: {
          id: c.get('memberId'),
          email: c.get('memberEmail') ?? '',
          emailVerified: c.get('memberEmailVerified'),
          firstName: c.get('memberFirstName'),
        },
      });
      return c.json({ memberId: c.get('memberId'), alreadyClaimed, state }, 200);
    } catch (err) {
      if (err instanceof OnboardingServiceError) {
        const status = err.code === 'no_session' ? 404 : err.code === 'forbidden' ? 403 : 409;
        return c.json({ error: err.message, code: err.code }, status);
      }
      throw err;
    }
  });

function fail(c: { json: (body: unknown, status: 400 | 404 | 409) => Response }, result: Extract<ActionResult, { ok: false }>) {
  const status = result.code === 'no_session' ? 404 : result.code === 'gated' || result.code === 'not_gated' ? 409 : 400;
  return c.json({ error: result.message, code: result.code, ...(result.questionKey ? { questionKey: result.questionKey } : {}) }, status);
}

export const onboardingRoutes = new Hono<OnboardingEnv>()
  .use('*', onboardingOpen)
  .use('*', session)

  /** The current session for the cookie, or a new one on the published flow. */
  .get('/session', rateLimit({ windowMs: 60_000, max: 60 }), async (c) => {
    const state = await onboarding.loadOrCreate({ anonymousSessionId: c.get('onboardingSessionId') });
    return c.json(state);
  })

  /** Start or resume, carrying over what the companion already knows. */
  .post(
    '/session',
    rateLimit({ windowMs: 60_000, max: 20 }),
    zValidator('json', startSessionSchema),
    async (c) => {
      const { carryOver } = c.req.valid('json');
      const state = await onboarding.loadOrCreate({
        anonymousSessionId: c.get('onboardingSessionId'),
        carryOver,
        ipHash: await hashIp(clientIp(c)),
      });
      return c.json(state);
    },
  )

  .post(
    '/session/answer',
    rateLimit({ windowMs: 60_000, max: 60 }),
    zValidator('json', answerSchema),
    async (c) => {
      const { questionKey, value } = c.req.valid('json');
      const result = await onboarding.answer({ anonymousSessionId: c.get('onboardingSessionId'), questionKey, value });
      if (!result.ok) return fail(c, result);
      return c.json(result.state);
    },
  )

  .post(
    '/session/skip',
    rateLimit({ windowMs: 60_000, max: 60 }),
    zValidator('json', skipSchema),
    async (c) => {
      const { questionKey } = c.req.valid('json');
      const result = await onboarding.skip({ anonymousSessionId: c.get('onboardingSessionId'), questionKey });
      if (!result.ok) return fail(c, result);
      return c.json(result.state);
    },
  )

  .post('/session/back', rateLimit({ windowMs: 60_000, max: 60 }), async (c) => {
    const result = await onboarding.back({ anonymousSessionId: c.get('onboardingSessionId') });
    if (!result.ok) return fail(c, result);
    return c.json(result.state);
  })

  /** Abandon the current session (answers purged) and start over. */
  .post(
    '/session/restart',
    rateLimit({ windowMs: 60_000, max: 10 }),
    zValidator('json', startSessionSchema),
    async (c) => {
      const { carryOver } = c.req.valid('json');
      const state = await onboarding.restart({
        anonymousSessionId: c.get('onboardingSessionId'),
        carryOver,
        ipHash: await hashIp(clientIp(c)),
      });
      return c.json(state);
    },
  )

  /** "Tell me when my state opens." Only on a notify gate. */
  .post(
    '/session/notify',
    rateLimit({ windowMs: 60_000, max: 5 }),
    zValidator('json', notifyRequestSchema),
    async (c) => {
      const { email, firstName } = c.req.valid('json');
      const result = await onboarding.notify({
        anonymousSessionId: c.get('onboardingSessionId'),
        email,
        firstName,
        ipHash: await hashIp(clientIp(c)),
      });
      if (!result.ok) return fail(c, result);
      return c.json(result.state, 201);
    },
  )

  .route('/session/claim', claimRoutes);
