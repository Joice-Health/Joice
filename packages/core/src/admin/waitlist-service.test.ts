import { describe, expect, spyOn, test } from 'bun:test';
import type { Database, WaitlistEntry } from '@joice/db';
import { createAdminWaitlistService } from './waitlist-service';
import type { AuditService } from './audit-service';
import type { AdminActor } from './schemas';
import type { WaitlistMarketingPort, WaitlistMarketingProfile } from '../marketing';

/**
 * updateStatus is what keeps the synced `waitlist_status` property truthful in
 * marketing segments, so these tests pin that contract: the status change
 * fires the marketing port after commit, a marketing failure never fails the
 * admin action, and no port configured means no sync attempted.
 */

function makeRow(overrides: Partial<WaitlistEntry> = {}): WaitlistEntry {
  return {
    id: 'entry-1',
    email: 'person@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    referralCode: 'abc123',
    referredByCode: null,
    referredById: null,
    referralCount: 0,
    sequence: 7,
    status: 'pending',
    metadata: null,
    ipHash: null,
    marketingSyncedAt: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

function stubDb(before: WaitlistEntry | undefined) {
  const updates: Array<Record<string, unknown>> = [];
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(before ? [before] : []) }),
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => {
        updates.push(patch);
        return {
          where: () => ({
            returning: () => Promise.resolve(before ? [{ ...before, ...patch }] : []),
          }),
        };
      },
    }),
  };
  const db = { transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
  return { db: db as unknown as Database, updates };
}

const audit = { record: async () => {} } as unknown as AuditService;
const actor: AdminActor = { clerkUserId: 'user_1', email: 'admin@joicehealth.com' };

function fakeMarketing() {
  const statusChanges: WaitlistMarketingProfile[] = [];
  const port: WaitlistMarketingPort = {
    async subscribeToWaitlist() {},
    async updateProfile() {},
    async statusChanged(profile) {
      statusChanges.push(profile);
    },
  };
  return { port, statusChanges };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('admin updateStatus marketing sync', () => {
  test('fires statusChanged with the fresh row after the transaction', async () => {
    const { db } = stubDb(makeRow());
    const { port, statusChanges } = fakeMarketing();
    const svc = createAdminWaitlistService(db, audit, { marketing: port });

    const after = await svc.updateStatus('entry-1', 'invited', actor);
    await flush();

    expect(after?.status).toBe('invited');
    expect(statusChanges).toHaveLength(1);
    expect(statusChanges[0]!.status).toBe('invited');
    expect(statusChanges[0]!.email).toBe('person@example.com');
  });

  test('a failing marketing port never fails the admin action', async () => {
    const { db } = stubDb(makeRow());
    const port: WaitlistMarketingPort = {
      async subscribeToWaitlist() {},
      async updateProfile() {},
      async statusChanged() {
        throw new Error('klaviyo is down');
      },
    };
    const svc = createAdminWaitlistService(db, audit, { marketing: port });

    const errorLog = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const after = await svc.updateStatus('entry-1', 'invited', actor);
      await flush();

      expect(after?.status).toBe('invited');
      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(String(errorLog.mock.calls[0]![0])).not.toContain('person@example.com');
    } finally {
      errorLog.mockRestore();
    }
  });

  test('no marketing configured → status change works, nothing fired', async () => {
    const { db } = stubDb(makeRow());
    const svc = createAdminWaitlistService(db, audit);

    const after = await svc.updateStatus('entry-1', 'converted', actor);
    expect(after?.status).toBe('converted');
  });

  test('unknown entry → null, marketing never called', async () => {
    const { db } = stubDb(undefined);
    const { port, statusChanges } = fakeMarketing();
    const svc = createAdminWaitlistService(db, audit, { marketing: port });

    const after = await svc.updateStatus('missing', 'invited', actor);
    await flush();

    expect(after).toBeNull();
    expect(statusChanges).toHaveLength(0);
  });
});
