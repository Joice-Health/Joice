import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ActiveEvalRunError,
  NoEvalCasesError,
  evalCaseInputSchema,
  evalCasePatchSchema,
  evalIdParamSchema,
  evalRunsQuerySchema,
  startEvalRunSchema,
} from '@joice/brain';
import { rateLimit } from '../middleware/rate-limit';
import { requireAdmin, type AdminEnv } from '../middleware/admin';
import { evalService } from '../services';

/**
 * The eval console's API: the brain's first admin surface of its own. Lives
 * here rather than on the api service because only this task has Bedrock
 * permissions, so only this task can execute a run (docs/rag/12-eval-console.md).
 *
 * Defined as a single chained sub-app so `.route('/api/brain/admin/eval', ...)`
 * keeps the request/response shapes flowing into BrainAppType. Relies on the
 * app-level clerkMiddleware for identity; requireAdmin authorizes. Deliberately
 * no audit_logs writes: run rows carry who triggered them and are their own
 * immutable history, and the one settings write this feature enables (promote)
 * goes through the api's audited endpoint.
 */
export const adminEvalRoutes = new Hono<AdminEnv>()
  .use('*', rateLimit({ windowMs: 60_000, max: 120 }))
  .use('*', requireAdmin)

  // --- The golden set ---
  .get('/cases', async (c) => {
    return c.json(await evalService.listCases());
  })
  .post('/cases', zValidator('json', evalCaseInputSchema), async (c) => {
    return c.json(await evalService.createCase(c.req.valid('json')), 201);
  })
  .patch(
    '/cases/:id',
    zValidator('param', evalIdParamSchema),
    zValidator('json', evalCasePatchSchema),
    async (c) => {
      const updated = await evalService.updateCase(c.req.valid('param').id, c.req.valid('json'));
      if (!updated) return c.json({ error: 'Case not found' }, 404);
      return c.json(updated);
    },
  )
  .delete('/cases/:id', zValidator('param', evalIdParamSchema), async (c) => {
    const deleted = await evalService.deleteCase(c.req.valid('param').id);
    if (!deleted) return c.json({ error: 'Case not found' }, 404);
    return c.json({ ok: true as const });
  })

  // --- Runs ---
  .get('/runs', zValidator('query', evalRunsQuerySchema), async (c) => {
    return c.json(await evalService.listRuns(c.req.valid('query')));
  })
  .post(
    '/runs',
    // A run is real model spend; belt on top of the DB guard's braces.
    rateLimit({ windowMs: 60_000, max: 10 }),
    zValidator('json', startEvalRunSchema),
    async (c) => {
      try {
        const run = await evalService.startRun({
          ...c.req.valid('json'),
          triggeredBy: c.get('adminUserId'),
          triggeredByEmail: c.get('adminEmail'),
        });
        return c.json({ run });
      } catch (err) {
        if (err instanceof ActiveEvalRunError) {
          return c.json({ error: 'A run is already in progress' }, 409);
        }
        if (err instanceof NoEvalCasesError) {
          return c.json({ error: 'No enabled cases to run' }, 400);
        }
        throw err;
      }
    },
  )
  .get('/runs/:id', zValidator('param', evalIdParamSchema), async (c) => {
    const detail = await evalService.getRun(c.req.valid('param').id);
    if (!detail) return c.json({ error: 'Run not found' }, 404);
    return c.json(detail);
  });
