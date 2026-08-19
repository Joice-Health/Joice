import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { requireInternalToken } from './internal-token';

const appWith = (token: string) =>
  new Hono().use('*', requireInternalToken(token)).get('/x', (c) => c.json({ ok: true }));

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
});
