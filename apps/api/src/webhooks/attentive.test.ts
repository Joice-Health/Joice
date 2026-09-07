import { describe, expect, test } from 'bun:test';
import { ATTENTIVE_SIGNATURE_HEADER, signAttentiveWebhook } from '@joice/marketing';
import type { MarketingConsentChange } from '@joice/core';
import { createAttentiveWebhookRoutes } from './attentive';

const SECRET = 'sekret';

function fakeConsent(matched = true) {
  const calls: MarketingConsentChange[] = [];
  return {
    calls,
    consent: {
      async applyMarketingConsent(change: MarketingConsentChange) {
        calls.push(change);
        return { matched };
      },
    },
  };
}

async function deliver(
  app: ReturnType<typeof createAttentiveWebhookRoutes>,
  body: unknown,
  opts: { secret?: string; signature?: string | null } = {},
) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const signature =
    opts.signature === null
      ? undefined
      : (opts.signature ?? (await signAttentiveWebhook(opts.secret ?? SECRET, raw)));
  return app.request('/', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature ? { [ATTENTIVE_SIGNATURE_HEADER]: signature } : {}),
    },
    body: raw,
  });
}

const payload = (type: string, extra: Record<string, unknown> = {}) => ({
  type,
  timestamp: 1788800000000,
  company: { display_name: 'Joice', company_id: 'c1' },
  subscriber: { email: 'Someone@Example.com', phone: '', external_id: 1 },
  subscription: { type: 'MARKETING' },
  ...extra,
});

describe('Attentive consent webhook', () => {
  test('email.unsubscribed stamps the address, lower-cased, at the event time', async () => {
    const { consent, calls } = fakeConsent();
    const app = createAttentiveWebhookRoutes({ secret: SECRET, consent });

    const res = await deliver(app, payload('email.unsubscribed'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, applied: true });
    expect(calls).toEqual([
      { email: 'someone@example.com', subscribed: false, at: new Date(1788800000000) },
    ]);
  });

  test('the four consent events map to subscribed or not', async () => {
    const { consent, calls } = fakeConsent();
    const app = createAttentiveWebhookRoutes({ secret: SECRET, consent });

    for (const type of ['email.subscribed', 'sms.subscribed', 'email.unsubscribed', 'sms.unsubscribed']) {
      await deliver(app, payload(type));
    }

    expect(calls.map((c) => c.subscribed)).toEqual([true, true, false, false]);
  });

  test('other events, a missing email, or a transactional subscription are acknowledged and ignored', async () => {
    const { consent, calls } = fakeConsent();
    const app = createAttentiveWebhookRoutes({ secret: SECRET, consent });

    for (const body of [
      payload('email.opened'),
      payload('email.unsubscribed', { subscriber: { email: '', phone: '+15555550123' } }),
      payload('email.unsubscribed', { subscriber: null }),
      payload('email.unsubscribed', { subscription: { type: 'TRANSACTIONAL' } }),
    ]) {
      const res = await deliver(app, body);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, applied: false });
    }
    expect(calls).toHaveLength(0);
  });

  test('an address that is not on the waitlist answers applied: false', async () => {
    const { consent } = fakeConsent(false);
    const app = createAttentiveWebhookRoutes({ secret: SECRET, consent });

    const res = await deliver(app, payload('email.unsubscribed'));

    expect(await res.json()).toEqual({ received: true, applied: false });
  });

  test('a missing timestamp falls back to now', async () => {
    const { consent, calls } = fakeConsent();
    const app = createAttentiveWebhookRoutes({ secret: SECRET, consent });
    const before = Date.now();

    await deliver(app, payload('email.unsubscribed', { timestamp: undefined }));

    expect(calls[0]!.at.getTime()).toBeGreaterThanOrEqual(before);
  });

  test('signed but malformed bodies are 400', async () => {
    const { consent, calls } = fakeConsent();
    const app = createAttentiveWebhookRoutes({ secret: SECRET, consent });

    expect((await deliver(app, '{not json')).status).toBe(400);
    expect((await deliver(app, { subscriber: {} })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test('a bad signature is 401 and changes nothing; an unset secret is 503', async () => {
    const { consent, calls } = fakeConsent();
    const app = createAttentiveWebhookRoutes({ secret: SECRET, consent });

    expect((await deliver(app, payload('email.unsubscribed'), { secret: 'other' })).status).toBe(401);
    expect((await deliver(app, payload('email.unsubscribed'), { signature: null })).status).toBe(401);
    expect(calls).toHaveLength(0);

    const unset = createAttentiveWebhookRoutes({ secret: '', consent });
    expect((await deliver(unset, payload('email.unsubscribed'))).status).toBe(503);
  });
});
