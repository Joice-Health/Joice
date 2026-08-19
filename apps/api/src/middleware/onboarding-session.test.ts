import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { ONBOARDING_COOKIE, createOnboardingSessionMiddleware } from './onboarding-session';

const app = new Hono<{ Variables: { onboardingSessionId: string } }>()
  .use('*', createOnboardingSessionMiddleware({ production: false }))
  .get('/s', (c) => c.json({ id: c.get('onboardingSessionId') }));

describe('onboarding session cookie', () => {
  test('issues an httpOnly uuid cookie on the first request', async () => {
    const res = await app.request('/s');
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${ONBOARDING_COOKIE}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toMatch(/Max-Age=31536000/);
    expect(setCookie).toContain('SameSite=None');
    const { id } = (await res.json()) as { id: string };
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('reuses a well-formed cookie and replaces a malformed one', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const ok = await app.request('/s', { headers: { cookie: `${ONBOARDING_COOKIE}=${id}` } });
    expect(((await ok.json()) as { id: string }).id).toBe(id);
    expect(ok.headers.get('set-cookie')).toBeNull();
    const bad = await app.request('/s', { headers: { cookie: `${ONBOARDING_COOKIE}=not-a-uuid` } });
    expect(((await bad.json()) as { id: string }).id).not.toBe('not-a-uuid');
    expect(bad.headers.get('set-cookie')).toContain(`${ONBOARDING_COOKIE}=`);
  });
});
