import { describe, expect, test } from 'bun:test';
import { createAttentiveClient, AttentiveRequestError } from './attentive';

/**
 * The client is a thin HTTP mapping, so these tests pin the things Attentive
 * actually cares about: the bearer header, the exact body shapes per endpoint,
 * the identifier rules, and the retry and timeout behavior.
 */

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
  signal: AbortSignal | null | undefined;
}

function fakeFetch(responses: Response[]) {
  const requests: Recorded[] = [];
  const queue = [...responses];
  const fetchImpl = (async (url: URL | Request | string, init?: RequestInit) => {
    requests.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
      signal: init?.signal,
    });
    return queue.shift() ?? new Response('', { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, requests };
}

const ok = () => new Response('', { status: 200 });

describe('createAttentiveClient', () => {
  test('sends the bearer and content-type headers, and no Klaviyo revision', async () => {
    const { fetchImpl, requests } = fakeFetch([ok()]);
    const client = createAttentiveClient({ apiKey: 'key_123', fetchImpl });

    await client.subscribe({ user: { email: 'a@example.com' }, signUpSourceId: 'src' });

    const headers = requests[0]!.headers;
    expect(headers.Authorization).toBe('Bearer key_123');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.revision).toBeUndefined();
  });

  test('upsertProfile sends properties to v1 first, then names to v2, with the client id on both', async () => {
    const { fetchImpl, requests } = fakeFetch([ok(), new Response('', { status: 202 })]);
    const client = createAttentiveClient({ apiKey: 'k', fetchImpl });

    await client.upsertProfile({
      user: { email: 'a@example.com', clientUserId: 'uuid-1' },
      firstName: 'Ada',
      lastName: null,
      properties: { referral_code: 'abc123', referral_count: 2 },
    });

    expect(requests.map((r) => r.url)).toEqual([
      'https://api.attentivemobile.com/v1/attributes/custom',
      'https://api.attentivemobile.com/v2/user/attributes',
    ]);
    expect(requests[0]!.body).toEqual({
      user: { email: 'a@example.com', externalIdentifiers: { clientUserId: 'uuid-1' } },
      properties: { referral_code: 'abc123', referral_count: 2 },
    });
    expect(requests[1]!.body).toEqual({
      identifiers: { email: 'a@example.com', clientUserId: 'uuid-1' },
      attributes: { firstName: 'Ada' },
    });
  });

  test('upsertProfile skips the call it has nothing for', async () => {
    const { fetchImpl, requests } = fakeFetch([ok(), ok()]);
    const client = createAttentiveClient({ apiKey: 'k', fetchImpl });

    await client.upsertProfile({ user: { email: 'a@example.com' }, properties: { lead_status: 'ready' } });
    expect(requests.map((r) => r.url)).toEqual(['https://api.attentivemobile.com/v1/attributes/custom']);

    await client.upsertProfile({ user: { email: 'a@example.com' }, firstName: ' Ada ' });
    expect(requests[1]!.url).toBe('https://api.attentivemobile.com/v2/user/attributes');
    expect(requests[1]!.body).toEqual({
      identifiers: { email: 'a@example.com' },
      attributes: { firstName: 'Ada' },
    });

    await client.upsertProfile({ user: { email: 'a@example.com' }, firstName: '', properties: {} });
    expect(requests).toHaveLength(2);
  });

  test('subscribe posts the user and the sign-up source id, and a 202 counts as success', async () => {
    const { fetchImpl, requests } = fakeFetch([new Response('{"user":{}}', { status: 202 })]);
    const client = createAttentiveClient({ apiKey: 'k', fetchImpl });

    await client.subscribe({
      user: { email: 'a@example.com', clientUserId: 'uuid-1' },
      signUpSourceId: 'unit-9',
    });

    expect(requests[0]!.url).toBe('https://api.attentivemobile.com/v1/subscriptions');
    expect(requests[0]!.body).toEqual({
      user: { email: 'a@example.com', externalIdentifiers: { clientUserId: 'uuid-1' } },
      signUpSourceId: 'unit-9',
    });
  });

  test('trackEvent posts the type, user, properties, dedupe id and an RFC 3339 time', async () => {
    const { fetchImpl, requests } = fakeFetch([ok()]);
    const client = createAttentiveClient({ apiKey: 'k', fetchImpl });
    const at = new Date('2026-09-07T12:00:00.000Z');

    await client.trackEvent(
      'Joined Waitlist',
      { email: 'a@example.com' },
      { was_referred: true },
      { externalEventId: 'uuid-1', occurredAt: at },
    );

    expect(requests[0]!.url).toBe('https://api.attentivemobile.com/v1/events/custom');
    expect(requests[0]!.body).toEqual({
      type: 'Joined Waitlist',
      user: { email: 'a@example.com' },
      properties: { was_referred: true },
      externalEventId: 'uuid-1',
      occurredAt: '2026-09-07T12:00:00.000Z',
    });
  });

  test('unsubscribe covers every channel and suppresses the confirmation unless asked', async () => {
    const { fetchImpl, requests } = fakeFetch([new Response('', { status: 202 }), ok()]);
    const client = createAttentiveClient({ apiKey: 'k', fetchImpl });

    await client.unsubscribe({ email: 'gone@example.com', clientUserId: 'ignored-here' });
    expect(requests[0]!.url).toBe('https://api.attentivemobile.com/v1/subscriptions/unsubscribe');
    expect(requests[0]!.body).toEqual({
      user: { email: 'gone@example.com' },
      notification: { disabled: true },
    });

    await client.unsubscribe({ phone: '+15555550123' }, { notify: true });
    expect(requests[1]!.body).toEqual({
      user: { phone: '+15555550123' },
      notification: { disabled: false },
    });
  });

  test('requestDeletion posts the subject and the audit message', async () => {
    const { fetchImpl, requests } = fakeFetch([ok()]);
    const client = createAttentiveClient({ apiKey: 'k', fetchImpl });

    await client.requestDeletion({ email: 'gone@example.com' }, 'Joice erasure request');

    expect(requests[0]!.url).toBe('https://api.attentivemobile.com/v1/privacy/delete-request');
    expect(requests[0]!.body).toEqual({
      subjectEmail: 'gone@example.com',
      requestMsg: 'Joice erasure request',
    });
  });

  test('me() is a bodiless GET whose JSON is returned', async () => {
    const { fetchImpl, requests } = fakeFetch([
      new Response(JSON.stringify({ companyName: 'Joice', companyId: 'c1' }), { status: 200 }),
    ]);
    const client = createAttentiveClient({ apiKey: 'k', fetchImpl });

    const account = await client.me();

    expect(requests[0]!.method).toBe('GET');
    expect(requests[0]!.url).toBe('https://api.attentivemobile.com/v1/me');
    expect(requests[0]!.body).toBeUndefined();
    expect(account.companyName).toBe('Joice');
  });

  test('refuses a user with no identifier or a non-E.164 phone before any request', async () => {
    const { fetchImpl, requests } = fakeFetch([ok()]);
    const client = createAttentiveClient({ apiKey: 'k', fetchImpl });

    await expect(client.subscribe({ user: {}, signUpSourceId: 's' })).rejects.toBeInstanceOf(TypeError);
    await expect(
      client.subscribe({ user: { phone: '5555550123' }, signUpSourceId: 's' }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(requests).toHaveLength(0);

    await client.subscribe({ user: { phone: '+15555550123' }, signUpSourceId: 's' });
    expect(requests).toHaveLength(1);
  });

  test('every request carries an abort signal', async () => {
    const { fetchImpl, requests } = fakeFetch([ok()]);
    const client = createAttentiveClient({ apiKey: 'k', fetchImpl });

    await client.subscribe({ user: { email: 'a@example.com' }, signUpSourceId: 's' });

    expect(requests[0]!.signal).toBeInstanceOf(AbortSignal);
  });

  test('a stalled request times out, is retried, and finally rejects', async () => {
    let attempts = 0;
    const fetchImpl = ((_url: unknown, init?: RequestInit) => {
      attempts += 1;
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      });
    }) as typeof fetch;
    const client = createAttentiveClient({ apiKey: 'k', fetchImpl, timeoutMs: 20, retryAttempts: 2 });

    const error: unknown = await client.me().catch((e) => e);

    expect((error as Error).name).toBe('TimeoutError');
    expect(attempts).toBe(2);
  }, 5_000);

  test('retries a 429 (honoring Retry-After) and succeeds on the next attempt', async () => {
    const { fetchImpl, requests } = fakeFetch([
      new Response('throttled', { status: 429, headers: { 'Retry-After': '1' } }),
      ok(),
    ]);
    const client = createAttentiveClient({ apiKey: 'k', fetchImpl });

    await client.subscribe({ user: { email: 'a@example.com' }, signUpSourceId: 's' });
    expect(requests).toHaveLength(2);
  }, 10_000);

  test('a 400 fails immediately without retrying, and the error omits the key', async () => {
    const { fetchImpl, requests } = fakeFetch([
      new Response('{"error":"bad payload"}', { status: 400 }),
    ]);
    const client = createAttentiveClient({ apiKey: 'key_super_secret', fetchImpl });

    const error: unknown = await client
      .subscribe({ user: { email: 'a@example.com' }, signUpSourceId: 's' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(AttentiveRequestError);
    expect((error as AttentiveRequestError).status).toBe(400);
    expect((error as AttentiveRequestError).message).toContain('bad payload');
    expect((error as AttentiveRequestError).message).not.toContain('key_super_secret');
    expect(requests).toHaveLength(1);
  });
});
