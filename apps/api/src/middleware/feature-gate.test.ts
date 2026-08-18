import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { FLAG_KEYS } from '@joice/core';
import { requireFlag } from './feature-gate';

/**
 * The gate is what turns the public waitlist off without a deploy. These
 * pin the two things that matter: off means 404 with a message a form can
 * show, and a missing flag (deleted in admin) reads as off, never as open.
 */
function appWith(flags: Record<string, boolean>) {
  const service = { evaluateAll: async () => flags };
  return new Hono().get(
    '/api/waitlist/stats',
    requireFlag(service, FLAG_KEYS.waitlist, "The waitlist isn't open right now."),
    (c) => c.json({ totalCount: 1 }),
  );
}

describe('requireFlag', () => {
  test('lets the request through when the flag is on', async () => {
    const res = await appWith({ waitlist: true }).request('/api/waitlist/stats');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ totalCount: 1 });
  });

  test('answers 404 with the given message when the flag is off', async () => {
    const res = await appWith({ waitlist: false }).request('/api/waitlist/stats');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "The waitlist isn't open right now." });
  });

  test('a missing flag reads as off (fails closed)', async () => {
    const res = await appWith({}).request('/api/waitlist/stats');
    expect(res.status).toBe(404);
  });
});
