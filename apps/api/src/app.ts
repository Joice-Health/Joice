import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  createWaitlistService,
  joinWaitlistSchema,
  referralCodeParamSchema,
} from '@joice/core';
import { getDatabase } from '@joice/db';
import { allowedOrigins } from './env';
import { rateLimit, clientIp } from './middleware/rate-limit';
import { hashIp } from './hash';

const waitlist = createWaitlistService(getDatabase());

const app = new Hono();

app.use('*', logger());
app.use('*', secureHeaders());
app.use(
  '/api/*',
  cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
);

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error('Unhandled error:', err);
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
});

/**
 * Routes are defined in a single chain so `typeof routes` carries the full
 * request/response shape — that's what @joice/api-client consumes via Hono RPC.
 * `/stats` is registered before `/:code` so it isn't swallowed by the param route.
 */
const routes = app
  .get('/health', (c) => c.json({ ok: true as const }))
  .post(
    '/api/waitlist',
    rateLimit({ windowMs: 60_000, max: 10 }),
    zValidator('json', joinWaitlistSchema),
    async (c) => {
      const { email, firstName, lastName, ref } = c.req.valid('json');
      const ipHash = await hashIp(clientIp(c));
      const entry = await waitlist.join({ email, firstName, lastName, ref, ipHash });
      return c.json(entry, 201);
    },
  )
  .get('/api/waitlist/stats', async (c) => {
    return c.json(await waitlist.getStats());
  })
  .get(
    '/api/waitlist/:code',
    zValidator('param', referralCodeParamSchema),
    async (c) => {
      const { code } = c.req.valid('param');
      const entry = await waitlist.getByCode(code);
      if (!entry) return c.json({ error: 'Referral code not found' }, 404);
      return c.json(entry);
    },
  );

export type AppType = typeof routes;
// `routes` is the same instance as `app`, but typed with the full route chain.
export default routes;
