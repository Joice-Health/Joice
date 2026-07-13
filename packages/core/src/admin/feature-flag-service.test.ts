import { describe, expect, test } from 'bun:test';
import type { Database } from '@joice/db';
import { createFeatureFlagService } from './feature-flag-service';
import { createAuditService } from './audit-service';

/**
 * Minimal chainable stub covering the drizzle calls the flag service makes.
 * Every select resolves to `rows`; mutations resolve to `[returningRow]`.
 */
function stubDb(opts: { rows: unknown[]; returningRow?: unknown; onSelect?: () => void }) {
  const selectChain = () => {
    opts.onSelect?.();
    const promise = Promise.resolve(opts.rows) as Promise<unknown[]> & Record<string, unknown>;
    promise.where = () => ({ limit: () => Promise.resolve(opts.rows) });
    promise.orderBy = () => Promise.resolve(opts.rows);
    return promise;
  };
  const db = {
    select: () => ({ from: selectChain }),
    insert: () => ({
      values: () => {
        const p = Promise.resolve() as Promise<void> & Record<string, unknown>;
        p.returning = () => Promise.resolve([opts.returningRow]);
        return p;
      },
    }),
    update: () => ({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([opts.returningRow]) }),
      }),
    }),
    delete: () => ({ where: () => Promise.resolve() }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return db as unknown as Database;
}

const actor = { clerkUserId: 'user_admin', email: 'admin@joice.test' };

describe('feature flag cache', () => {
  test('evaluateAll caches within TTL and refreshes after expiry', async () => {
    let selects = 0;
    let clock = 0;
    const db = stubDb({
      rows: [{ key: 'member_signups', enabled: true }],
      onSelect: () => selects++,
    });
    const flags = createFeatureFlagService(db, createAuditService(db), {
      cacheTtlMs: 30_000,
      now: () => clock,
    });

    expect(await flags.evaluateAll()).toEqual({ member_signups: true });
    await flags.evaluateAll();
    expect(selects).toBe(1); // second call served from cache

    clock = 30_001;
    await flags.evaluateAll();
    expect(selects).toBe(2); // TTL expired → re-queried
  });

  test('mutations invalidate the cache immediately', async () => {
    let selects = 0;
    let clock = 0;
    const row = { id: 'f1', key: 'new_flag', enabled: false, description: null };
    const db = stubDb({ rows: [row], returningRow: row, onSelect: () => selects++ });
    const flags = createFeatureFlagService(db, createAuditService(db), {
      cacheTtlMs: 30_000,
      now: () => clock,
    });

    await flags.evaluateAll();
    const cachedSelects = selects;

    await flags.update('f1', { enabled: true }, actor);
    await flags.evaluateAll();
    expect(selects).toBeGreaterThan(cachedSelects); // cache was dropped despite TTL
  });
});
