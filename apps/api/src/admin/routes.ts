import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { clerkMiddleware } from '@hono/clerk-auth';
import { zValidator } from '@hono/zod-validator';
import {
  adminLeadsQuerySchema,
  adminUserQuerySchema,
  adminWaitlistQuerySchema,
  auditLogQuerySchema,
  createFeatureFlagSchema,
  setAdminRoleSchema,
  settingKeySchema,
  updateFeatureFlagSchema,
  updateUserStatusSchema,
  updateWaitlistEntrySchema,
  upsertSettingSchema,
  uuidParamSchema,
  type AdminActor,
} from '@joice/core';
// The admin console edits the brain's behavior, so it validates against the
// brain's own schema rather than keeping a second copy in sync.
import { brainSettingsPatchSchema, DEFAULT_BRAIN_SETTINGS, SAFETY_FLOOR } from '@joice/brain';
import { z } from 'zod';
import { rateLimit } from '../middleware/rate-limit';
import { requireAdmin, type AdminEnv } from './auth';
import { adminWaitlist, audit, brainConfig, featureFlags, leads, settings, userService } from '../services';
import { clerkClient } from './clerk';
import { env } from '../env';

const settingKeyParamSchema = z.object({ key: settingKeySchema });

const actorOf = (c: { get: (k: 'adminUserId' | 'adminEmail') => string | undefined }): AdminActor => ({
  clerkUserId: c.get('adminUserId')!,
  email: c.get('adminEmail'),
});

/** RFC-4180-ish CSV escaping: quote when the value needs it. */
const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const s = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/**
 * Admin API. Defined as a single chained sub-app so `.route('/api/admin', ...)`
 * keeps the full request/response shape flowing into the RPC client types.
 */
export const adminRoutes = new Hono<AdminEnv>()
  .use('*', rateLimit({ windowMs: 60_000, max: 120 }))
  .use('*', clerkMiddleware({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.CLERK_PUBLISHABLE_KEY }))
  .use('*', requireAdmin)

  // --- Waitlist ---
  .get('/waitlist', zValidator('query', adminWaitlistQuerySchema), async (c) => {
    return c.json(await adminWaitlist.list(c.req.valid('query')));
  })
  .get('/waitlist/export', async (c) => {
    const columns = [
      'email',
      'firstName',
      'lastName',
      'status',
      'referralCode',
      'referralCount',
      'sequence',
      'createdAt',
    ] as const;

    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="joice-waitlist.csv"`);
    return stream(c, async (s) => {
      await s.write(`${columns.join(',')}\n`);
      for await (const batch of adminWaitlist.exportAll()) {
        const lines = batch
          .map((row) => columns.map((col) => csvCell(row[col])).join(','))
          .join('\n');
        await s.write(`${lines}\n`);
      }
    });
  })
  .patch(
    '/waitlist/:id',
    zValidator('param', uuidParamSchema),
    zValidator('json', updateWaitlistEntrySchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const { status } = c.req.valid('json');
      const entry = await adminWaitlist.updateStatus(id, status, actorOf(c));
      if (!entry) return c.json({ error: 'Waitlist entry not found' }, 404);
      return c.json(entry);
    },
  )

  // --- Member users ---
  .get('/users', zValidator('query', adminUserQuerySchema), async (c) => {
    return c.json(await userService.list(c.req.valid('query')));
  })
  .patch(
    '/users/:id',
    zValidator('param', uuidParamSchema),
    zValidator('json', updateUserStatusSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const { status } = c.req.valid('json');
      const user = await userService.updateStatus(id, status, actorOf(c));
      if (!user) return c.json({ error: 'User not found' }, 404);
      return c.json(user);
    },
  )

  // --- Pre-onboarding leads (companion capture; brain-owned table, read-only) ---
  .get('/leads', zValidator('query', adminLeadsQuerySchema), async (c) => {
    return c.json(await leads.list(c.req.valid('query')));
  })

  // --- Admin accounts (Clerk-backed) ---
  .get('/admins', async (c) => {
    const { data } = await clerkClient.users.getUserList({ limit: 100, orderBy: '-created_at' });
    const admins = data.map((u) => ({
      clerkUserId: u.id,
      email: u.primaryEmailAddress?.emailAddress ?? null,
      firstName: u.firstName,
      lastName: u.lastName,
      role: (u.publicMetadata as { role?: string }).role ?? null,
      createdAt: u.createdAt,
      lastSignInAt: u.lastSignInAt,
    }));
    return c.json({ items: admins });
  })
  .post('/admins', zValidator('json', setAdminRoleSchema), async (c) => {
    const { clerkUserId, role } = c.req.valid('json');
    const actor = actorOf(c);

    if (clerkUserId === actor.clerkUserId && role === null) {
      return c.json({ error: 'You cannot revoke your own admin access' }, 400);
    }

    const before = await clerkClient.users.getUser(clerkUserId);
    await clerkClient.users.updateUserMetadata(clerkUserId, {
      publicMetadata: { role },
    });

    await audit.record({
      actorClerkUserId: actor.clerkUserId,
      actorEmail: actor.email,
      action: role ? 'admin.grant' : 'admin.revoke',
      entityType: 'clerk_user',
      entityId: clerkUserId,
      before: { role: (before.publicMetadata as { role?: string }).role ?? null },
      after: { role },
    });

    return c.json({ clerkUserId, role });
  })

  // --- Feature flags ---
  .get('/flags', async (c) => {
    return c.json({ items: await featureFlags.list() });
  })
  .post('/flags', zValidator('json', createFeatureFlagSchema), async (c) => {
    const input = c.req.valid('json');
    if (await featureFlags.getByKey(input.key)) {
      return c.json({ error: 'A flag with this key already exists' }, 409);
    }
    return c.json(await featureFlags.create(input, actorOf(c)), 201);
  })
  .patch(
    '/flags/:id',
    zValidator('param', uuidParamSchema),
    zValidator('json', updateFeatureFlagSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const flag = await featureFlags.update(id, c.req.valid('json'), actorOf(c));
      if (!flag) return c.json({ error: 'Flag not found' }, 404);
      return c.json(flag);
    },
  )
  .delete('/flags/:id', zValidator('param', uuidParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const removed = await featureFlags.remove(id, actorOf(c));
    if (!removed) return c.json({ error: 'Flag not found' }, 404);
    return c.json({ ok: true as const });
  })

  // --- Settings ---
  .get('/settings', async (c) => {
    return c.json({ items: await settings.list() });
  })
  .put(
    '/settings/:key',
    zValidator('param', settingKeyParamSchema),
    zValidator('json', upsertSettingSchema),
    async (c) => {
      const { key } = c.req.valid('param');
      const { value, description } = c.req.valid('json');
      return c.json(await settings.upsert(key, value, description, actorOf(c)));
    },
  )
  .delete('/settings/:key', zValidator('param', settingKeyParamSchema), async (c) => {
    const { key } = c.req.valid('param');
    const removed = await settings.remove(key, actorOf(c));
    if (!removed) return c.json({ error: 'Setting not found' }, 404);
    return c.json({ ok: true as const });
  })

  // --- Brain (chatbot behavior) ---
  .get('/brain', async (c) => {
    return c.json({
      /** Stored overrides only — what the form edits. */
      settings: await brainConfig.getStored(),
      /** Fully resolved (stored ?? defaults ?? env) — what chat is using now. */
      resolved: await brainConfig.get(),
      defaults: DEFAULT_BRAIN_SETTINGS,
      /** Code-level rules that cannot be changed from the admin. */
      safetyFloor: SAFETY_FLOOR,
    });
  })
  .put('/brain', zValidator('json', brainSettingsPatchSchema), async (c) => {
    return c.json(await brainConfig.update(c.req.valid('json'), actorOf(c)));
  })
  .delete('/brain', async (c) => {
    await brainConfig.reset(actorOf(c));
    return c.json({ ok: true as const });
  })

  // --- Audit log ---
  .get('/audit-logs', zValidator('query', auditLogQuerySchema), async (c) => {
    return c.json(await audit.list(c.req.valid('query')));
  });

export type AdminRoutes = typeof adminRoutes;
