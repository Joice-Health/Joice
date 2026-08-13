import { describe, expect, test } from 'bun:test';
import { createKlaviyoClient, KlaviyoRequestError } from './klaviyo';

/**
 * The client is a thin HTTP mapping, so these tests pin the things Klaviyo
 * actually cares about: auth + revision headers, the three JSON:API body
 * shapes, and the retry behavior on throttling vs. hard failures.
 */

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function fakeFetch(responses: Response[]) {
  const requests: Recorded[] = [];
  const queue = [...responses];
  const fetchImpl = (async (url: URL | Request | string, init?: RequestInit) => {
    requests.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return queue.shift() ?? new Response('', { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, requests };
}

const ok = () => new Response('', { status: 200 });

describe('createKlaviyoClient', () => {
  test('sends auth, revision, and content-type headers on every request', async () => {
    const { fetchImpl, requests } = fakeFetch([ok()]);
    const client = createKlaviyoClient({ apiKey: 'pk_test_123', fetchImpl });

    await client.importProfile({ email: 'a@example.com' });

    const headers = requests[0]!.headers;
    expect(headers.Authorization).toBe('Klaviyo-API-Key pk_test_123');
    expect(headers.revision).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(headers['Content-Type']).toBe('application/json');
  });

  test('importProfile posts a JSON:API profile with external_id and properties', async () => {
    const { fetchImpl, requests } = fakeFetch([ok()]);
    const client = createKlaviyoClient({ apiKey: 'pk', fetchImpl });

    await client.importProfile({
      email: 'a@example.com',
      externalId: 'uuid-1',
      firstName: 'Ada',
      lastName: null,
      properties: { referral_code: 'abc123' },
    });

    expect(requests[0]!.url).toBe('https://a.klaviyo.com/api/profile-import/');
    const data = requests[0]!.body.data as Record<string, unknown>;
    expect(data.type).toBe('profile');
    expect(data.attributes).toEqual({
      email: 'a@example.com',
      external_id: 'uuid-1',
      first_name: 'Ada',
      properties: { referral_code: 'abc123' },
    });
  });

  test('subscribeToList grants SUBSCRIBED email consent tied to the list, with provenance', async () => {
    const { fetchImpl, requests } = fakeFetch([ok()]);
    const client = createKlaviyoClient({ apiKey: 'pk', fetchImpl });

    await client.subscribeToList('LIST99', 'a@example.com', 'Joice waitlist signup');

    expect(requests[0]!.url).toBe(
      'https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/',
    );
    const data = requests[0]!.body.data as {
      attributes: {
        custom_source?: string;
        profiles: { data: Array<{ attributes: Record<string, unknown> }> };
      };
      relationships: { list: { data: { type: string; id: string } } };
    };
    expect(data.relationships.list.data).toEqual({ type: 'list', id: 'LIST99' });
    expect(data.attributes.custom_source).toBe('Joice waitlist signup');
    expect(data.attributes.profiles.data[0]!.attributes).toEqual({
      email: 'a@example.com',
      subscriptions: { email: { marketing: { consent: 'SUBSCRIBED' } } },
    });
  });

  test('trackEvent posts the metric, profile email, properties, and dedupe unique_id', async () => {
    const { fetchImpl, requests } = fakeFetch([ok()]);
    const client = createKlaviyoClient({ apiKey: 'pk', fetchImpl });

    await client.trackEvent('Joined Waitlist', 'a@example.com', { was_referred: true }, 'uuid-1');

    expect(requests[0]!.url).toBe('https://a.klaviyo.com/api/events/');
    const attributes = (requests[0]!.body.data as { attributes: Record<string, unknown> })
      .attributes;
    expect(attributes.metric).toEqual({
      data: { type: 'metric', attributes: { name: 'Joined Waitlist' } },
    });
    expect(attributes.profile).toEqual({
      data: { type: 'profile', attributes: { email: 'a@example.com' } },
    });
    expect(attributes.properties).toEqual({ was_referred: true });
    expect(attributes.unique_id).toBe('uuid-1');
  });

  test('a 202 (async job accepted) counts as success', async () => {
    const { fetchImpl, requests } = fakeFetch([new Response('', { status: 202 })]);
    const client = createKlaviyoClient({ apiKey: 'pk', fetchImpl });

    await client.subscribeToList('LIST99', 'a@example.com');
    expect(requests).toHaveLength(1);
  });

  test('retries a 429 (honoring Retry-After) and succeeds on the next attempt', async () => {
    const { fetchImpl, requests } = fakeFetch([
      new Response('throttled', { status: 429, headers: { 'Retry-After': '1' } }),
      ok(),
    ]);
    const client = createKlaviyoClient({ apiKey: 'pk', fetchImpl });

    await client.importProfile({ email: 'a@example.com' });
    expect(requests).toHaveLength(2);
  }, 10_000);

  test('a 400 fails immediately without retrying, and the error omits the key', async () => {
    const { fetchImpl, requests } = fakeFetch([
      new Response('{"errors":[{"detail":"bad payload"}]}', { status: 400 }),
    ]);
    const client = createKlaviyoClient({ apiKey: 'pk_super_secret', fetchImpl });

    const error: unknown = await client.importProfile({ email: 'a@example.com' }).catch((e) => e);
    expect(error).toBeInstanceOf(KlaviyoRequestError);
    expect((error as KlaviyoRequestError).status).toBe(400);
    expect((error as KlaviyoRequestError).message).not.toContain('pk_super_secret');
    expect(requests).toHaveLength(1);
  });
});

describe('suppressProfile', () => {
  test('posts the suppression job body Klaviyo expects', async () => {
    const { fetchImpl, requests } = fakeFetch([ok()]);
    const client = createKlaviyoClient({ apiKey: 'pk_test_123', fetchImpl });

    await client.suppressProfile('gone@example.com');

    expect(requests[0]!.url).toContain('/api/profile-suppression-bulk-create-jobs/');
    const data = requests[0]!.body.data as {
      type: string;
      attributes: { profiles: { data: Array<{ attributes: { email: string } }> } };
    };
    expect(data.type).toBe('profile-suppression-bulk-create-job');
    expect(data.attributes.profiles.data[0]!.attributes.email).toBe('gone@example.com');
  });
});
