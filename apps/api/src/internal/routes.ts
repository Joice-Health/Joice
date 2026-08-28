import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { OBSERVATION_SOURCES, memberProfileView } from '@joice/core';
import { z } from 'zod';
import { env } from '../env';
import { requireInternalToken } from '../middleware/internal-token';
import { rateLimit } from '../middleware/rate-limit';
import { onboarding, phiStatus, profiles } from '../services';

/**
 * Service-to-service routes, today for the brain. Registered on the app
 * OUTSIDE the typed chain: not a browser API, must not leak into the RPC
 * types. Behind the internal bearer token; see middleware/internal-token.ts
 * for the trust story. What crosses is bounded by tier: marketing and
 * personal traits only, widening to health-tier traits solely while both
 * PHI keys are on (phiStatus), and never consent rows; the same rule
 * memberProfileView applies to the member themselves.
 */

const memberParamSchema = z.object({ memberId: z.string().uuid() });

const observationsSchema = z.object({
  memberId: z.string().uuid(),
  observations: z
    .array(
      z.object({
        trait: z.string().min(1).max(100),
        value: z.unknown(),
        source: z.enum(OBSERVATION_SOURCES).default('companion'),
        confidence: z.number().min(0).max(1).optional(),
      }),
    )
    .min(1)
    .max(50),
});

export const internalRoutes = new Hono()
  .use('*', rateLimit({ windowMs: 60_000, max: 600 }))
  .use('*', requireInternalToken(env.INTERNAL_API_TOKEN))

  /** What the brain may know about a member when answering them. */
  .get('/profile/:memberId', zValidator('param', memberParamSchema), async (c) => {
    const { memberId } = c.req.valid('param');
    const [profile, intake, phi] = await Promise.all([
      profiles.getForMember(memberId),
      onboarding.stateForMember(memberId),
      phiStatus(),
    ]);
    if (!profile && !intake) return c.json({ error: 'Unknown member' }, 404);
    const view = memberProfileView({
      memberId,
      email: null,
      firstName: null,
      profile,
      intake: null,
      // Fail-closed: memberProfileView's default is marketing + personal, so
      // the health tier appears only while both PHI keys are on.
      tiers: phi.unlocked ? (['marketing', 'personal', 'health'] as const) : undefined,
    });
    return c.json({
      memberId,
      firstName: view.firstName,
      goal: view.goal,
      goalLabel: view.goalLabel,
      segment: view.segment,
      traits: view.traits.map(({ key, label, value }) => ({ key, label, value })),
      intakeStatus: intake?.status ?? null,
    });
  })

  /** Another service observed something about a member (the companion's goal, later a clinician). */
  .post('/observations', zValidator('json', observationsSchema), async (c) => {
    const { memberId, observations } = c.req.valid('json');
    await profiles.recordObservations(
      observations.map((o) => ({ trait: o.trait, value: o.value, source: o.source, confidence: o.confidence, memberId })),
    );
    return c.json({ recorded: observations.length }, 201);
  });
