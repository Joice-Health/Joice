import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { createClerkAuth, type ClerkAuthVariables } from './clerk';

/**
 * The brain's own bearer verification. The invariant that matters most is the
 * one production broke with the previous wrapper: a request must NEVER 500
 * because of its Authorization header. Anything unverifiable is anonymous.
 * Real signature verification is Clerk SDK territory and is not re-tested
 * here; these tests pin the middleware's behavior around it.
 */

function probeApp(mw: ReturnType<typeof createClerkAuth>) {
  const app = new Hono<{ Variables: ClerkAuthVariables }>();
  app.use('*', mw);
  app.get('/probe', (c) => c.json({ claims: c.get('clerkClaims') }));
  return app;
}

const JWT_SHAPED =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEifQ.c2lnbmF0dXJl';

describe('clerkAuth (brain)', () => {
  test('no Authorization header is anonymous', async () => {
    const res = await probeApp(createClerkAuth({ jwtKey: 'irrelevant' })).request('/probe');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ claims: null });
  });

  test('a garbage bearer token is anonymous, never a 500', async () => {
    const res = await probeApp(createClerkAuth({ jwtKey: 'not-a-pem' })).request('/probe', {
      headers: { Authorization: 'Bearer garbage' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ claims: null });
  });

  test('a JWT-shaped token that fails verification is anonymous, never a 500', async () => {
    const res = await probeApp(createClerkAuth({ jwtKey: 'not-a-pem' })).request('/probe', {
      headers: { Authorization: `Bearer ${JWT_SHAPED}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ claims: null });
  });

  test('with no keys configured a token is ignored entirely', async () => {
    const res = await probeApp(createClerkAuth({})).request('/probe', {
      headers: { Authorization: `Bearer ${JWT_SHAPED}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ claims: null });
  });
});
