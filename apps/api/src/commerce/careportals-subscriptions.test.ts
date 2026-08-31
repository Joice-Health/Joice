import { describe, expect, test } from 'bun:test';
import { createCareportalsSubscriptions } from './careportals-subscriptions';

/**
 * The adapter against a scripted fetch. Two invariants under test everywhere:
 * fail-closed (anything short of an exact email match plus a positively
 * matched active subscription is false, and no failure ever throws), and
 * never-on-the-request-path (isSubscribed answers from cache immediately and
 * revalidates in the background; flush() is the test-only await for that).
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
  test('the request path never waits: first read false, warmed after flush, then cached', async () => {
    const { impl, calls } = fetchScript(happyPath);
    const port = createCareportalsSubscriptions({ ...baseConfig, fetchImpl: impl });
    // Cold: answers immediately with false while the refresh runs behind.
    expect(await port.isSubscribed('member@joice.com')).toBe(false);
    await port.flush();
    expect(await port.isSubscribed('member@joice.com')).toBe(true);
    const afterWarm = calls.length;
    expect(await port.isSubscribed('member@joice.com')).toBe(true);
    expect(calls.length).toBe(afterWarm); // served from cache, no extra calls
  });

  test('a keyword near-miss is not a match', async () => {
    const { impl } = fetchScript((url) => {
      if (url.includes('/auth')) return { status: 201, body: { token: 'jwt-1' } };
      if (url.includes('/customers/lookups'))
        return { status: 200, body: [{ _id: 'c9', email: 'other@joice.com' }] };
      return { status: 200, body: [] };
    });
    const port = createCareportalsSubscriptions({ ...baseConfig, fetchImpl: impl });
    await port.isSubscribed('member@joice.com');
    await port.flush();
    expect(await port.isSubscribed('member@joice.com')).toBe(false);
  });

  test('ownership needs a positive customer match: missing or odd-shaped refs prove nothing', async () => {
    const subscriptionsBody = {
      data: [
        { status: 'active' }, // no customer ref at all
        { customer: { unrecognized: 'shape' }, status: 'active' },
        { customer: 'someone-else', status: 'active' },
      ],
    };
    const { impl } = fetchScript((url) => {
      if (url.includes('/auth')) return { status: 201, body: { token: 'jwt-1' } };
      if (url.includes('/customers/lookups'))
        return { status: 200, body: [{ _id: 'c1', email: 'member@joice.com' }] };
      return { status: 200, body: subscriptionsBody };
    });
    const port = createCareportalsSubscriptions({ ...baseConfig, fetchImpl: impl });
    await port.isSubscribed('member@joice.com');
    await port.flush();
    expect(await port.isSubscribed('member@joice.com')).toBe(false);
  });

  test('a populated {id} customer ref matches like {_id} does', async () => {
    const { impl } = fetchScript((url) => {
      if (url.includes('/auth')) return { status: 201, body: { token: 'jwt-1' } };
      if (url.includes('/customers/lookups'))
        return { status: 200, body: [{ id: 'c1', email: 'member@joice.com' }] };
      return { status: 200, body: [{ customer: { id: 'c1' }, status: 'active' }] };
    });
    const port = createCareportalsSubscriptions({ ...baseConfig, fetchImpl: impl });
    await port.isSubscribed('member@joice.com');
    await port.flush();
    expect(await port.isSubscribed('member@joice.com')).toBe(true);
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
    await port.isSubscribed('member@joice.com');
    await port.flush();
    expect(await port.isSubscribed('member@joice.com')).toBe(false);
  });

  test('an expired token re-authenticates once, and concurrent cold reads share one login', async () => {
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
    await Promise.all([
      port.isSubscribed('member@joice.com'),
      port.isSubscribed('other@joice.com'),
    ]);
    await port.flush();
    expect(await port.isSubscribed('member@joice.com')).toBe(true);
    // One initial login shared by both cold reads, one re-login after the 401.
    expect(authCount).toBe(2);
  });

  test('a transient failure is not cached as a definitive no for the full window', async () => {
    let down = true;
    let clock = 0;
    const { impl } = fetchScript((url) => {
      if (url.includes('/auth')) return { status: 201, body: { token: 'jwt-1' } };
      if (down) return { status: 500, body: {} };
      if (url.includes('/customers/lookups'))
        return { status: 200, body: [{ _id: 'c1', email: 'member@joice.com' }] };
      return { status: 200, body: [{ customer: 'c1', status: 'active' }] };
    });
    const port = createCareportalsSubscriptions({
      ...baseConfig,
      fetchImpl: impl,
      now: () => clock,
    });
    await port.isSubscribed('member@joice.com');
    await port.flush();
    expect(await port.isSubscribed('member@joice.com')).toBe(false);

    down = false;
    clock = 31_000; // past the short unknown TTL, far inside the 5-min one
    await port.isSubscribed('member@joice.com'); // kicks the retry
    await port.flush();
    expect(await port.isSubscribed('member@joice.com')).toBe(true);
  });

  test('auth failure and network errors are false, never a throw', async () => {
    const authDown = createCareportalsSubscriptions({
      ...baseConfig,
      fetchImpl: fetchScript(() => ({ status: 403, body: {} })).impl,
    });
    await authDown.isSubscribed('member@joice.com');
    await authDown.flush();
    expect(await authDown.isSubscribed('member@joice.com')).toBe(false);

    const networkDown = createCareportalsSubscriptions({
      ...baseConfig,
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
    });
    await networkDown.isSubscribed('member@joice.com');
    await networkDown.flush();
    expect(await networkDown.isSubscribed('member@joice.com')).toBe(false);
  });
});
