import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { requireInternalToken } from './internal-token';

const appWith = (token: string, options?: { edgeBlocked?: boolean }) =>
  new Hono().use('*', requireInternalToken(token, options)).get('/x', (c) => c.json({ ok: true }));

describe('requireInternalToken', () => {
  test('an unset token answers 503, whatever is presented', async () => {
    const res = await appWith('').request('/x', { headers: { authorization: 'Bearer anything' } });
    expect(res.status).toBe(503);
  });

  test('the right bearer passes; a wrong or missing one is 401', async () => {
    const app = appWith('sekret-token');
    expect((await app.request('/x', { headers: { authorization: 'Bearer sekret-token' } })).status).toBe(200);
    expect((await app.request('/x', { headers: { authorization: 'bearer sekret-token' } })).status).toBe(200);
    expect((await app.request('/x', { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
    expect((await app.request('/x', { headers: { authorization: 'Bearer sekret-token2' } })).status).toBe(401);
    expect((await app.request('/x')).status).toBe(401);
  });

  test('edge blocked: the origin-verify header is refused even with the right token', async () => {
    const app = appWith('sekret-token', { edgeBlocked: true });
    const viaEdge = await app.request('/x', {
      headers: { authorization: 'Bearer sekret-token', 'x-origin-verify': 'whatever-cloudfront-sent' },
    });
    expect(viaEdge.status).toBe(401);
    // The private path (no edge header) is unchanged.
    expect((await app.request('/x', { headers: { authorization: 'Bearer sekret-token' } })).status).toBe(200);
  });

  test('edge not blocked: the header changes nothing (the pre-cutover window and dev)', async () => {
    const app = appWith('sekret-token');
    const viaEdge = await app.request('/x', {
      headers: { authorization: 'Bearer sekret-token', 'x-origin-verify': 'whatever-cloudfront-sent' },
    });
    expect(viaEdge.status).toBe(200);
  });
});
