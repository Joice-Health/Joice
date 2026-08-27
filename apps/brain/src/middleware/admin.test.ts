import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { requireAdmin, type AdminEnv } from './admin';
import type { BrainSessionClaims } from './clerk';

/**
 * The authorization ladder for the brain's admin surface: no session is 401,
 * a session without the admin role is 403, an admin passes with the actor
 * context set. requireAdmin reads the `clerkClaims` context entry the
 * app-level clerkAuth middleware sets, so tests drive it with a stand-in.
 */

function appWithClaims(claims: BrainSessionClaims | null) {
  const app = new Hono<AdminEnv>();
  app.use('*', async (c, next) => {
    c.set('clerkClaims', claims);
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
    const res = await appWithClaims(null).request('/probe');
    expect(res.status).toBe(401);
  });

  test('a signed-in non-admin is 403', async () => {
    const res = await appWithClaims({
      sub: 'user_1',
      metadata: { role: 'member' },
    }).request('/probe');
    expect(res.status).toBe(403);
  });

  test('a missing metadata claim is 403, not a crash', async () => {
    const res = await appWithClaims({ sub: 'user_1' }).request('/probe');
    expect(res.status).toBe(403);
  });

  test('an admin passes with the actor context set', async () => {
    const res = await appWithClaims({
      sub: 'user_admin',
      metadata: { role: 'admin' },
      email: 'shaun@joicehealth.com',
    }).request('/probe');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'user_admin', email: 'shaun@joicehealth.com' });
  });

  test('a non-string email claim is dropped, not passed through', async () => {
    const res = await appWithClaims({
      sub: 'user_admin',
      metadata: { role: 'admin' },
      email: { odd: true },
    }).request('/probe');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'user_admin', email: null });
  });
});
