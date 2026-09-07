import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { ATTENTIVE_SIGNATURE_HEADER, signAttentiveWebhook } from '@joice/marketing';
import { requireAttentiveSignature } from './attentive-signature';

const appWith = (secret: string) =>
  new Hono()
    .use('*', requireAttentiveSignature(secret))
    .post('/x', async (c) => c.json({ body: await c.req.text() }));

const post = (app: Hono, body: string, signature?: string) =>
  app.request('/x', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature ? { [ATTENTIVE_SIGNATURE_HEADER]: signature } : {}),
    },
    body,
  });

describe('requireAttentiveSignature', () => {
  test('an unset secret answers 503, whatever is presented', async () => {
    const res = await post(appWith(''), '{}', 'deadbeef');
    expect(res.status).toBe(503);
  });

  test('a valid signature passes and the handler still reads the same raw body', async () => {
    const body = '{"type":"email.unsubscribed"}';
    const res = await post(appWith('sekret'), body, await signAttentiveWebhook('sekret', body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ body });
  });

  test('a wrong or missing signature is 401', async () => {
    const app = appWith('sekret');
    const body = '{"type":"email.unsubscribed"}';
    expect((await post(app, body, await signAttentiveWebhook('other', body))).status).toBe(401);
    expect((await post(app, body + ' ', await signAttentiveWebhook('sekret', body))).status).toBe(401);
    expect((await post(app, body)).status).toBe(401);
  });
});
