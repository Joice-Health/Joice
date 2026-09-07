import { describe, expect, spyOn, test } from 'bun:test';
import type { Database, WaitlistEntry } from '@joice/db';
import { createWaitlistService } from './waitlist-service';
import type { WaitlistMarketingPort, WaitlistMarketingProfile } from './marketing';

/**
 * The marketing sync is fire-and-forget, so these tests assert the contract
 * that keeps signups safe: the port fires exactly once per new entry with the
 * right fields (and never on duplicates), a throwing port never fails join(),
 * and success is the only thing that stamps marketingSyncedAt.
 *
 * A tiny stub stands in for Postgres. Full-row selects (findByEmail /
 * findByReferralCode / findById) happen in a deterministic order, so they pop
 * from a queue; count() selects (position/total) just report the row count.
 */

function makeRow(overrides: Partial<WaitlistEntry> = {}): WaitlistEntry {
  return {
    id: 'entry-1',
    email: 'new@example.com',
    firstName: 'New',
    lastName: 'Person',
    referralCode: 'newcode1',
    referredByCode: null,
    referredById: null,
    referralCount: 0,
    sequence: 42,
    status: 'pending',
    metadata: null,
    ipHash: 'hashed',
    marketingSyncedAt: null,
    marketingUnsubscribedAt: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

function stubDb(rowSelects: WaitlistEntry[][]) {
  const queue = [...rowSelects];
  const updates: Array<Record<string, unknown>> = [];
  const insertedRows: WaitlistEntry[] = [];

  // Thenable-with-methods so both `await db.select().from(x)` and
  // `.where().limit()` work, like the real drizzle builder.
  const chain = (result: () => unknown[]) => {
    const c: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'limit', 'orderBy', 'returning']) c[method] = () => c;
    c.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve()
        .then(result)
        .then(resolve, reject);
    return c;
  };

  const db: Record<string, unknown> = {
    select: (fields?: unknown) =>
      fields
        ? chain(() => [{ value: insertedRows.length }]) // count() queries
        : chain(() => queue.shift() ?? []),
    insert: () => ({
      values: (v: Partial<WaitlistEntry>) => ({
        returning: () => {
          const row = makeRow({ id: `inserted-${insertedRows.length + 1}`, ...v });
          insertedRows.push(row);
          return Promise.resolve([row]);
        },
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => {
        const c = chain(() => []) as Record<string, unknown>;
        updates.push(patch);
        return c;
      },
    }),
    transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };

  return { db: db as unknown as Database, updates, insertedRows };
}

function fakeMarketing() {
  const subscribed: WaitlistMarketingProfile[] = [];
  const updated: WaitlistMarketingProfile[] = [];
  const statusChanges: WaitlistMarketingProfile[] = [];
  const port: WaitlistMarketingPort = {
    async subscribeToWaitlist(profile) {
      subscribed.push(profile);
    },
    async updateProfile(profile) {
      updated.push(profile);
    },
    async statusChanged(profile) {
      statusChanges.push(profile);
    },
  };
  return { port, subscribed, updated, statusChanges };
}

/** Drain the fire-and-forget sync chain (pure microtasks + one macrotask hop). */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('waitlist marketing sync', () => {
  test('a new signup subscribes exactly once with the marketing fields — and no ipHash', async () => {
    const { db, updates } = stubDb([[]]); // findByEmail: no existing entry
    const { port, subscribed } = fakeMarketing();
    const svc = createWaitlistService(db, { marketing: port });

    const view = await svc.join({ email: 'new@example.com', firstName: 'New', lastName: 'Person' });
    await flush();

    expect(view.referralCode).toBeString();
    expect(subscribed).toHaveLength(1);
    const profile = subscribed[0]!;
    expect(profile.email).toBe('new@example.com');
    expect(profile.referralCode).toBeString();
    expect(profile.signupSequence).toBe(42);
    expect(profile.wasReferred).toBe(false);
    expect(Object.keys(profile)).not.toContain('ipHash');

    // Success stamps marketingSyncedAt on the new entry.
    expect(updates.some((u) => u.marketingSyncedAt instanceof Date)).toBe(true);
  });

  test('a duplicate email returns the existing card and never touches marketing', async () => {
    const existing = makeRow({ email: 'dupe@example.com' });
    const { db, updates } = stubDb([[existing]]);
    const { port, subscribed, updated } = fakeMarketing();
    const svc = createWaitlistService(db, { marketing: port });

    const view = await svc.join({ email: 'dupe@example.com', firstName: 'New', lastName: 'Person' });
    await flush();

    expect(view.referralCode).toBe(existing.referralCode);
    expect(subscribed).toHaveLength(0);
    expect(updated).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  test('a throwing port never fails the signup, and marketingSyncedAt stays unset', async () => {
    const { db, updates } = stubDb([[]]);
    const port: WaitlistMarketingPort = {
      async subscribeToWaitlist() {
        throw new Error('attentive is down');
      },
      async updateProfile() {},
      async statusChanged() {},
    };
    const svc = createWaitlistService(db, { marketing: port });

    const errorLog = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const view = await svc.join({ email: 'new@example.com', firstName: 'New', lastName: 'Person' });
      await flush();

      expect(view.position).toBeNumber();
      expect(updates.some((u) => 'marketingSyncedAt' in u)).toBe(false);
      // The failure is logged by id, never by email.
      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(String(errorLog.mock.calls[0]![0])).not.toContain('new@example.com');
    } finally {
      errorLog.mockRestore();
    }
  });

  test('a referred signup also re-syncs the referrer with the fresh referralCount', async () => {
    const referrer = makeRow({
      id: 'referrer-1',
      email: 'referrer@example.com',
      referralCode: 'refcode1',
      referralCount: 2,
    });
    const referrerAfterBump = { ...referrer, referralCount: 3 };
    const { db, updates } = stubDb([
      [], // findByEmail: new signup
      [referrer], // findByReferralCode
      [referrerAfterBump], // findById re-read inside the sync chain
    ]);
    const { port, subscribed, updated } = fakeMarketing();
    const svc = createWaitlistService(db, { marketing: port });

    await svc.join({ email: 'new@example.com', firstName: 'New', lastName: 'Person', ref: 'refcode1' });
    await flush();

    expect(subscribed).toHaveLength(1);
    expect(subscribed[0]!.wasReferred).toBe(true);
    expect(updated).toHaveLength(1);
    expect(updated[0]!.email).toBe('referrer@example.com');
    expect(updated[0]!.referralCount).toBe(3);

    // referral bump (tx) + ONE marketingSyncedAt stamp (the new entry only).
    // The referrer's consent-free refresh must never stamp their column —
    // NULL has to keep meaning "initial subscribe never succeeded".
    expect(updates.some((u) => u.referralCount === 3)).toBe(true);
    expect(updates.filter((u) => u.marketingSyncedAt instanceof Date)).toHaveLength(1);
  });

  test('defaults to the noop port — join works and nothing is stamped as synced', async () => {
    const { db, updates } = stubDb([[]]);
    const svc = createWaitlistService(db);

    const view = await svc.join({ email: 'new@example.com', firstName: 'New', lastName: 'Person' });
    await flush();

    expect(view.referralCode).toBeString();
    // Unconfigured must not stamp marketingSyncedAt — NULL means "never synced".
    expect(updates.some((u) => 'marketingSyncedAt' in u)).toBe(false);
  });
});

/**
 * The consent webhook's bookkeeping. A dedicated stub records the update
 * patch and the where clause; the where is walked for the parameter values,
 * which is how the normalised email is asserted without a database.
 */
function stubConsentDb(matchedIds: string[]) {
  const updates: Array<{ patch: Record<string, unknown>; where: unknown }> = [];
  const db = {
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: (where: unknown) => ({
          returning: () => {
            updates.push({ patch, where });
            return Promise.resolve(matchedIds.map((id) => ({ id })));
          },
        }),
      }),
    }),
  };
  return { db: db as unknown as Database, updates };
}

function containsValue(node: unknown, value: unknown, seen = new Set<unknown>()): boolean {
  if (node === value) return true;
  if (typeof node !== 'object' || node === null || seen.has(node)) return false;
  seen.add(node);
  return Object.values(node as Record<string, unknown>).some((child) =>
    containsValue(child, value, seen),
  );
}

describe('applyMarketingConsent', () => {
  const at = new Date('2026-09-10T12:00:00Z');

  test('an unsubscribe stamps the column and leaves updatedAt alone', async () => {
    const { db, updates } = stubConsentDb(['entry-1']);
    const svc = createWaitlistService(db);

    const result = await svc.applyMarketingConsent({ email: 'a@example.com', subscribed: false, at });

    expect(result).toEqual({ matched: true });
    expect(updates).toHaveLength(1);
    expect(updates[0]!.patch).toEqual({ marketingUnsubscribedAt: at });
    expect('updatedAt' in updates[0]!.patch).toBe(false);
  });

  test('a subscribe clears the column', async () => {
    const { db, updates } = stubConsentDb(['entry-1']);
    const svc = createWaitlistService(db);

    await svc.applyMarketingConsent({ email: 'a@example.com', subscribed: true, at });

    expect(updates[0]!.patch).toEqual({ marketingUnsubscribedAt: null });
    expect(containsValue(updates[0]!.where, at)).toBe(true);
  });

  test('the email is normalised before the lookup', async () => {
    const { db, updates } = stubConsentDb(['entry-1']);
    const svc = createWaitlistService(db);

    await svc.applyMarketingConsent({ email: '  Someone@Example.COM ', subscribed: false, at });

    expect(containsValue(updates[0]!.where, 'someone@example.com')).toBe(true);
    expect(containsValue(updates[0]!.where, '  Someone@Example.COM ')).toBe(false);
  });

  test('an address that is not on the waitlist reports no match', async () => {
    const { db } = stubConsentDb([]);
    const svc = createWaitlistService(db);

    expect(await svc.applyMarketingConsent({ email: 'x@example.com', subscribed: false, at })).toEqual({
      matched: false,
    });
  });
});
