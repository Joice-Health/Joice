import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId, type RequestIdVariables } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { FLAG_KEYS, joinWaitlistSchema, referralCodeParamSchema } from '@joice/core';
import { allowedOrigins } from './env';
import { rateLimit, clientIp } from './middleware/rate-limit';
import { requireFlag } from './middleware/feature-gate';
import { hashIp } from './hash';
import { checkHealth } from './health';
import { requestLog } from './middleware/request-log';
import { featureFlags, waitlist } from './services';
import { adminRoutes } from './admin/routes';
import { onboardingRoutes } from './onboarding/routes';

const app = new Hono<{ Variables: RequestIdVariables }>();

// requestId first — everything downstream, including the logger and the error
// handler, reads the id it sets. It also echoes it as X-Request-Id, so the id
// in a bug report matches the id in CloudWatch.
app.use('*', requestId());
app.use('*', requestLog);
app.use('*', secureHeaders());
app.use(
  '/api/*',
  cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    // The intake session rides on an httpOnly cookie; in dev the web app is a
    // different origin, so the browser only sends it with credentials allowed
    // here and `credentials: 'include'` on the client. Same-origin in prod.
    credentials: true,
  }),
);

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  // The id goes to both sides: the member can quote it, and it's the key that
  // finds this stack trace among everything else in the log group.
  const reqId = c.get('requestId');
  console.error(JSON.stringify({ reqId, path: c.req.path, error: String(err) }));
  console.error(err);
  return c.json({ error: 'Something went wrong. Please try again.', reqId }, 500);
});

/**
 * The public waitlist is a feature flag (seeded by migration, toggled in
 * /admin/flags). Off, the page redirects to "Something special is coming" and
 * these three endpoints answer 404 together, so nobody joins through the API
 * while the door is shut. Admin waitlist routes are unaffected.
 */
const waitlistOpen = requireFlag(
  featureFlags,
  FLAG_KEYS.waitlist,
  "The waitlist isn't open right now.",
);

/**
 * Routes are defined in a single chain so `typeof routes` carries the full
 * request/response shape — that's what @joice/api-client consumes via Hono RPC.
 * `/stats` is registered before `/:code` so it isn't swallowed by the param route.
 */
const routes = app
  // 503 when the DB is unreachable, so the ALB drains the task and the ECS
  // circuit breaker can actually catch a broken release. See health.ts.
  .get('/health', async (c) => {
    const report = await checkHealth();
    return c.json(report, report.ok ? 200 : 503);
  })
  .post(
    '/api/waitlist',
    rateLimit({ windowMs: 60_000, max: 10 }),
    waitlistOpen,
    zValidator('json', joinWaitlistSchema),
    async (c) => {
      const { email, firstName, lastName, ref } = c.req.valid('json');
      const ipHash = await hashIp(clientIp(c));
      const entry = await waitlist.join({ email, firstName, lastName, ref, ipHash });
      return c.json(entry, 201);
    },
  )
  .get('/api/waitlist/stats', waitlistOpen, async (c) => {
    return c.json(await waitlist.getStats());
  })
  .get(
    '/api/waitlist/:code',
    waitlistOpen,
    zValidator('param', referralCodeParamSchema),
    async (c) => {
      const { code } = c.req.valid('param');
      const entry = await waitlist.getByCode(code);
      if (!entry) return c.json({ error: 'Referral code not found' }, 404);
      return c.json(entry);
    },
  )
  // Runtime feature flags for both apps; served from a ~30s in-memory cache.
  .get('/api/flags', rateLimit({ windowMs: 60_000, max: 60 }), async (c) => {
    return c.json(await featureFlags.evaluateAll());
  })
  // The intake flow: anonymous, cookie-keyed, behind the `onboarding` flag.
  .route('/api/onboarding', onboardingRoutes)
  .route('/api/admin', adminRoutes);

export type AppType = typeof routes;
// `routes` is the same instance as `app`, but typed with the full route chain.
export default routes;
