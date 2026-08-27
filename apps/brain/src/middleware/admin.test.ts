import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { requireAdmin, type AdminEnv } from './admin';

/**
 * The authorization ladder for the brain's admin surface: no session is 401,
 * a session without the admin role is 403, an admin passes with the actor
 * context set. getAuth reads the `clerkAuth` context entry the app-level
 * clerkMiddleware sets (a function returning the auth object in this
 * @hono/clerk-auth version), so tests drive it with a stand-in middleware.
 */

function appWithAuth(auth: { userId?: string; sessionClaims?: unknown } | null) {
  const app = new Hono<AdminEnv>();
  app.use('*', async (c, next) => {
    c.set('clerkAuth' as never, (() => auth) as never);
    await next();
  });
  app.use('*', requireAdmin);
  app.get('/probe', (c) =>
    c.json({ userId: c.get('adminUserId'), email: c.get('adminEmail') ?? null }),
  );
  return app;
}

describe('requireAdmin (brain)', () => {
  test('no session is 401', async () => {
    const res = await appWithAuth(null).request('/probe');
    expect(res.status).toBe(401);
  });

  test('a signed-in non-admin is 403', async () => {
    const res = await appWithAuth({
      userId: 'user_1',
      sessionClaims: { metadata: { role: 'member' } },
    }).request('/probe');
    expect(res.status).toBe(403);
  });

  test('a missing metadata claim is 403, not a crash', async () => {
    const res = await appWithAuth({ userId: 'user_1', sessionClaims: {} }).request('/probe');
    expect(res.status).toBe(403);
  });

  test('an admin passes with the actor context set', async () => {
    const res = await appWithAuth({
      userId: 'user_admin',
      sessionClaims: { metadata: { role: 'admin' }, email: 'shaun@joicehealth.com' },
    }).request('/probe');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'user_admin', email: 'shaun@joicehealth.com' });
  });
});
