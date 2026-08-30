import { Hono } from 'hono';
import { clerkMiddleware } from '@hono/clerk-auth';
import { createLabUploadSchema, memberProfileView, uuidParamSchema } from '@joice/core';
import { zValidator } from '@hono/zod-validator';
import { env } from '../env';
import { rateLimit } from '../middleware/rate-limit';
import { labUploads, onboarding, phiStatus, profiles } from '../services';
import { requireMember } from './index';
import type { MemberEnv } from './auth';

/**
 * Member-facing routes (`/api/me/*`): anything a signed-in member asks about
 * themselves. `requireMember` creates the member's `users` row on its first
 * call after sign-up (see ./auth.ts), so the web's first request here or to
 * the claim is what makes the member exist on our side. The profile read
 * arrives with the claim story.
 */
export const memberRoutes = new Hono<MemberEnv>()
  .use('*', rateLimit({ windowMs: 60_000, max: 60 }))
  .use('*', clerkMiddleware({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.CLERK_PUBLISHABLE_KEY }))
  .use('*', requireMember)

  /** Who am I, as far as the platform is concerned. Creates the member record if this is the first call. */
  .get('/', async (c) => {
    return c.json({
      memberId: c.get('memberId'),
      email: c.get('memberEmail'),
      emailVerified: c.get('memberEmailVerified'),
      firstName: c.get('memberFirstName'),
    });
  })

  /** The member's profile as they may see it (marketing + personal tiers) with their intake state. */
  .get('/profile', async (c) => {
    const memberId = c.get('memberId');
    const [profile, intake] = await Promise.all([profiles.getForMember(memberId), onboarding.stateForMember(memberId)]);
    return c.json(
      memberProfileView({
        memberId,
        email: c.get('memberEmail'),
        firstName: c.get('memberFirstName'),
        profile,
        intake,
      }),
    );
  })

  /**
   * Lab and concern uploads (story 5.3). The whole surface answers 404 until
   * BOTH PHI keys are on AND a labs bucket is configured: a member cannot even
   * discover the door before the compliance posture allows the room. Bytes go
   * browser-to-S3 with the presigned URL; only records live here.
   */
  .get('/labs', async (c) => {
    if (!labUploads || !(await phiStatus()).unlocked) return c.json({ error: 'Not available' }, 404);
    return c.json({ items: await labUploads.listForMember(c.get('memberId')) });
  })
  .post('/labs', zValidator('json', createLabUploadSchema), async (c) => {
    if (!labUploads || !(await phiStatus()).unlocked) return c.json({ error: 'Not available' }, 404);
    const result = await labUploads.create(c.get('memberId'), c.req.valid('json'));
    return c.json(result, 201);
  })
  .delete('/labs/:id', zValidator('param', uuidParamSchema), async (c) => {
    if (!labUploads || !(await phiStatus()).unlocked) return c.json({ error: 'Not available' }, 404);
    const removed = await labUploads.remove(c.get('memberId'), c.req.valid('param').id);
    if (!removed) return c.json({ error: 'Not found' }, 404);
    return c.json({ removed: true });
  });
