import { describe, expect, test } from 'bun:test';
import { createCareportalsSubscriptions } from './careportals-subscriptions';

/**
 * The adapter against a scripted fetch. The invariant under test everywhere:
 * fail-closed. Anything short of an exact email match plus an active
 * subscription is false, and no failure ever throws into the request path.
 */

type Responder = (url: string, init?: RequestInit) => { status: number; body: unknown };

function fetchScript(responder: Responder) {
  const calls: string[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    calls.push(href);
    const { status, body } = responder(href, init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { impl, calls };
}

const baseConfig = {
  organization: 'joicehealth_com',
  username: 'svc@joicehealth.com',
  password: 'pw',
};

const happyPath: Responder = (url) => {
  if (url.includes('/auth')) return { status: 201, body: { token: 'jwt-1' } };
  if (url.includes('/customers/lookups'))
    return { status: 200, body: [{ _id: 'c1', email: 'Member@Joice.com' }] };
  if (url.includes('/subscriptions'))
    return { status: 200, body: [{ customer: 'c1', status: 'active' }] };
  return { status: 404, body: {} };
};

describe('careportals subscriptions', () => {
  test('an exact email match with an active subscription is true, and cached', async () => {
    const { impl, calls } = fetchScript(happyPath);
    const port = createCareportalsSubscriptions({ ...baseConfig, fetchImpl: impl });
    expect(await port.isSubscribed('member@joice.com')).toBe(true);
    const afterFirst = calls.length;
    expect(await port.isSubscribed('member@joice.com')).toBe(true);
    expect(calls.length).toBe(afterFirst); // served from cache, no extra calls
  });

  test('a keyword near-miss is not a match', async () => {
    const { impl } = fetchScript((url) => {
      if (url.includes('/auth')) return { status: 201, body: { token: 'jwt-1' } };
      if (url.includes('/customers/lookups'))
        return { status: 200, body: [{ _id: 'c9', email: 'other@joice.com' }] };
      return { status: 200, body: [] };
    });
    const port = createCareportalsSubscriptions({ ...baseConfig, fetchImpl: impl });
    expect(await port.isSubscribed('member@joice.com')).toBe(false);
  });

  test('a cancelled subscription is false', async () => {
    const { impl } = fetchScript((url) => {
      if (url.includes('/auth')) return { status: 201, body: { token: 'jwt-1' } };
      if (url.includes('/customers/lookups'))
        return { status: 200, body: [{ _id: 'c1', email: 'member@joice.com' }] };
      if (url.includes('/subscriptions'))
        return { status: 200, body: { data: [{ customer: 'c1', status: 'cancelled' }] } };
      return { status: 404, body: {} };
    });
    const port = createCareportalsSubscriptions({ ...baseConfig, fetchImpl: impl });
    expect(await port.isSubscribed('member@joice.com')).toBe(false);
  });

  test('an expired token re-authenticates once and succeeds', async () => {
    let authCount = 0;
    const { impl } = fetchScript((url, init) => {
      if (url.includes('/auth')) {
        authCount += 1;
        return { status: 201, body: { token: `jwt-${authCount}` } };
      }
      const bearer = (init?.headers as Record<string, string>)?.authorization;
      if (bearer === 'Bearer jwt-1') return { status: 401, body: {} };
      if (url.includes('/customers/lookups'))
        return { status: 200, body: [{ _id: 'c1', email: 'member@joice.com' }] };
      return { status: 200, body: [{ customer: 'c1', status: 'active' }] };
    });
    const port = createCareportalsSubscriptions({ ...baseConfig, fetchImpl: impl });
    expect(await port.isSubscribed('member@joice.com')).toBe(true);
    expect(authCount).toBe(2);
  });

  test('auth failure, unknown shapes, and network errors are all false, never a throw', async () => {
    const authDown = createCareportalsSubscriptions({
      ...baseConfig,
      fetchImpl: fetchScript(() => ({ status: 403, body: {} })).impl,
    });
    expect(await authDown.isSubscribed('member@joice.com')).toBe(false);

    const weirdShape = createCareportalsSubscriptions({
      ...baseConfig,
      fetchImpl: fetchScript((url) =>
        url.includes('/auth')
          ? { status: 201, body: { token: 'jwt-1' } }
          : { status: 200, body: { unexpected: true } },
      ).impl,
    });
    expect(await weirdShape.isSubscribed('member@joice.com')).toBe(false);

    const networkDown = createCareportalsSubscriptions({
      ...baseConfig,
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
    });
    expect(await networkDown.isSubscribed('member@joice.com')).toBe(false);
  });
});
