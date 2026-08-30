import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  FLOW_KEY,
  FlowServiceError,
  ProtocolRulesInvalidError,
  createFlowVersionSchema,
  evaluateProtocolRules,
  funnelQuerySchema,
  onboardingSettingsPatchSchema,
  protocolRulesSchema,
  publishFlowVersionSchema,
  rollbackFlowSchema,
  serviceAreaRequestsQuerySchema,
  simulateRequestSchema,
  simulate,
  stateCodeParamSchema,
  updateFlowVersionSchema,
  updateServiceAreaSchema,
  uuidParamSchema,
  type AdminActor,
  type EngineContext,
} from '@joice/core';
import { z } from 'zod';
import { memberProfileView } from '@joice/core';
import {
  flows,
  onboarding,
  onboardingConfig,
  onboardingEvents,
  phiStatus,
  profiles,
  protocolRules,
  serviceAreaRequests,
  serviceAreas,
  userService,
} from '../services';
import type { AdminEnv } from './auth';

const actorOf = (c: { get: (k: 'adminUserId' | 'adminEmail') => string | undefined }): AdminActor => ({
  clerkUserId: c.get('adminUserId')!,
  email: c.get('adminEmail'),
});

const flowKeyParamSchema = z.object({ key: z.literal(FLOW_KEY) });

function flowError(c: { json: (body: unknown, status: 404 | 409) => Response }, err: unknown) {
  if (err instanceof FlowServiceError) {
    return c.json({ error: err.message, code: err.code }, err.code === 'not_found' ? 404 : 409);
  }
  throw err;
}

/**
 * The admin's onboarding surface, mounted at /api/admin/onboarding (inside the
 * admin chain: rate limit, Clerk, requireAdmin). Editing is drafts and
 * publishes, never edits of a published version; gates (service areas, the
 * minimum age) live on their own routes with their own audit actions so
 * opening a state never hides among copy changes. The simulator runs the real
 * engine and persists nothing.
 */
export const adminOnboardingRoutes = new Hono<AdminEnv>()

  // --- Flows and versions ---
  .get('/flows', async (c) => {
    // The editor's unlock state rides here: the browser can read the flag on
    // its own but never the PHI_READY env half, so the server says both.
    const [items, phi] = await Promise.all([flows.listFlows(), phiStatus()]);
    return c.json({ items, phi });
  })
  .get('/flows/:key/versions', zValidator('param', flowKeyParamSchema), async (c) => {
    const items = await flows.listVersions(c.req.valid('param').key);
    // The list stays light: definitions are fetched per version.
    return c.json({
      items: items.map(({ definition: _definition, validationReport: _report, ...row }) => row),
    });
  })
  .post(
    '/flows/:key/versions',
    zValidator('param', flowKeyParamSchema),
    zValidator('json', createFlowVersionSchema),
    async (c) => {
      try {
        const row = await flows.createDraft(c.req.valid('param').key, c.req.valid('json'), actorOf(c));
        return c.json(row, 201);
      } catch (err) {
        return flowError(c, err);
      }
    },
  )
  .get('/versions/:id', zValidator('param', uuidParamSchema), async (c) => {
    const found = await flows.getVersion(c.req.valid('param').id).catch((err) => {
      if (err instanceof FlowServiceError) return null;
      throw err;
    });
    if (!found) return c.json({ error: 'Version not found' }, 404);
    return c.json(found.version);
  })
  .put(
    '/versions/:id',
    zValidator('param', uuidParamSchema),
    zValidator('json', updateFlowVersionSchema),
    async (c) => {
      try {
        const { version, report } = await flows.saveDraft(c.req.valid('param').id, c.req.valid('json'), actorOf(c));
        return c.json({ version, report });
      } catch (err) {
        return flowError(c, err);
      }
    },
  )
  .post(
    '/versions/:id/publish',
    zValidator('param', uuidParamSchema),
    zValidator('json', publishFlowVersionSchema),
    async (c) => {
      try {
        const result = await flows.publish(c.req.valid('param').id, actorOf(c), c.req.valid('json'));
        if (!result.ok) return c.json({ error: 'The definition does not validate', report: result.report }, 422);
        return c.json({ version: result.version });
      } catch (err) {
        return flowError(c, err);
      }
    },
  )
  .post(
    '/flows/:key/rollback',
    zValidator('param', flowKeyParamSchema),
    zValidator('json', rollbackFlowSchema),
    async (c) => {
      try {
        const version = await flows.rollback(c.req.valid('param').key, c.req.valid('json').versionId, actorOf(c));
        return c.json({ version });
      } catch (err) {
        return flowError(c, err);
      }
    },
  )

  // --- The simulator: the real engine, nothing persisted ---
  .post('/simulate', zValidator('json', simulateRequestSchema), async (c) => {
    const input = c.req.valid('json');
    let definition = input.definition;
    if (!definition) {
      const found = await flows.getVersion(input.versionId!);
      if (!found) return c.json({ error: 'Version not found' }, 404);
      definition = found.definition;
    }
    const [settings, areas] = await Promise.all([onboardingConfig.get(), serviceAreas.map()]);
    const ctx: EngineContext = {
      minimumAge: input.context?.minimumAge ?? settings.minimumAge,
      serviceAreas: { ...areas, ...input.context?.serviceAreaOverrides },
      now: input.context?.now ? new Date(input.context.now) : new Date(),
      segmentRules: definition.segmentRules,
    };
    const result = simulate(definition, input.persona, ctx);
    const { snapshot: _snapshot, ...view } = result;
    // The protocol preview: every stored rule the persona's final traits
    // match, ranked, with why-traces. A recommendation preview for admins
    // and (later) clinicians; nothing here ever reaches a member.
    const protocols = evaluateProtocolRules(await protocolRules.get(), result.traits);
    return c.json({ ...view, protocols });
  })

  // --- Protocol rules (the sketch: same condition language, own audit) ---
  .get('/protocol-rules', async (c) => {
    return c.json({ rules: await protocolRules.get() });
  })
  .put('/protocol-rules', zValidator('json', z.object({ rules: protocolRulesSchema })), async (c) => {
    try {
      const rules = await protocolRules.save(c.req.valid('json').rules, actorOf(c));
      return c.json({ rules });
    } catch (err) {
      if (err instanceof ProtocolRulesInvalidError) {
        return c.json({ error: err.message, issues: err.issues }, 422);
      }
      throw err;
    }
  })

  // --- Service areas and the minimum age (their own audit actions) ---
  .get('/service-areas', async (c) => {
    return c.json({ items: await serviceAreas.list(), settings: await onboardingConfig.get() });
  })
  .patch(
    '/service-areas/:code',
    zValidator('param', stateCodeParamSchema),
    zValidator('json', updateServiceAreaSchema),
    async (c) => {
      const row = await serviceAreas.update(c.req.valid('param').code, c.req.valid('json'), actorOf(c));
      if (!row) return c.json({ error: 'Unknown state' }, 404);
      return c.json(row);
    },
  )
  .put('/settings', zValidator('json', onboardingSettingsPatchSchema), async (c) => {
    return c.json(await onboardingConfig.update(c.req.valid('json'), actorOf(c)));
  })

  // --- The funnel and the notify-me requests ---
  .get('/funnel', zValidator('query', funnelQuerySchema), async (c) => {
    return c.json(await onboardingEvents.funnel(c.req.valid('query')));
  })
  .get('/requests', zValidator('query', serviceAreaRequestsQuerySchema), async (c) => {
    return c.json(await serviceAreaRequests.list(c.req.valid('query')));
  })

  // --- The member's registered sessions, for support: state only, no answers dump ---
  .get('/sessions/member/:id', zValidator('param', uuidParamSchema), async (c) => {
    const state = await onboarding.stateForMember(c.req.valid('param').id);
    if (!state) return c.json({ error: 'No intake for that member' }, 404);
    return c.json(state);
  })

  /**
   * A member's profile as support may see it: the same tier-bounded view the
   * member gets, plus provenance per trait. Health-tier traits stay out until
   * the PHI keys are on, for admins too.
   */
  .get('/members/:id/profile', zValidator('param', uuidParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const [user, profile, intake] = await Promise.all([
      userService.getById(id),
      profiles.getForMember(id),
      onboarding.stateForMember(id),
    ]);
    if (!user && !profile) return c.json({ error: 'Unknown member' }, 404);
    const view = memberProfileView({
      memberId: id,
      email: user?.email ?? null,
      firstName: user?.firstName ?? null,
      profile,
      intake,
    });
    return c.json({
      ...view,
      user: user
        ? { clerkUserId: user.clerkUserId, status: user.status, createdAt: user.createdAt, lastName: user.lastName }
        : null,
    });
  });
