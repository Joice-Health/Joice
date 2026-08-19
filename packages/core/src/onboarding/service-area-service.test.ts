import { describe, expect, test } from 'bun:test';
import type { Database } from '@joice/db';
import { createAuditService } from '../admin/audit-service';
import { createServiceAreaService } from './service-area-service';
import { createServiceAreaRequestService } from './service-area-request-service';
import { createOnboardingConfigService } from './onboarding-config-service';

function stubDb(selects: unknown[][], returning: unknown[][] = []) {
  const log: Array<{ op: string; args: unknown[] }> = [];
  const make = (op: string, args: unknown[]): Record<string, unknown> => {
    log.push({ op, args });
    const resolveTo = op === 'select' ? () => selects.shift() ?? [] : () => returning.shift() ?? [{ id: 'row' }];
    const chain: Record<string, unknown> = {};
    const step = (name: string) => (...a: unknown[]) => {
      log.push({ op: `${op}.${name}`, args: a });
      return chain;
    };
    for (const name of ['from', 'where', 'orderBy', 'limit', 'offset', 'values', 'set', 'returning', 'onConflictDoUpdate', 'onConflictDoNothing']) chain[name] = step(name);
    chain.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => Promise.resolve(resolveTo()).then(onOk, onErr);
    return chain;
  };
  const db = {
    select: (...a: unknown[]) => make('select', a),
    insert: (t: unknown) => make('insert', [t]),
    update: (t: unknown) => make('update', [t]),
    delete: (t: unknown) => make('delete', [t]),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db: db as unknown as Database, log };
}

const actor = { clerkUserId: 'user_admin', email: 'admin@joice.test' };

describe('service areas', () => {
  test('map caches and a missing state reads as notify through the engine default', async () => {
    const { db, log } = stubDb([[{ stateCode: 'CA', status: 'open' }, { stateCode: 'NY', status: 'notify' }]]);
    let clock = 0;
    const svc = createServiceAreaService(db, createAuditService(db), { now: () => clock });
    expect(await svc.map()).toEqual({ CA: 'open', NY: 'notify' });
    await svc.map();
    expect(log.filter((l) => l.op === 'select')).toHaveLength(1);
    clock = 31_000;
    await svc.map();
    expect(log.filter((l) => l.op === 'select')).toHaveLength(2);
  });

  test('update audits service_area.update with before and after, then drops the cache', async () => {
    const before = { id: 'a', stateCode: 'CA', status: 'notify', note: null };
    const { db, log } = stubDb([[before]], [[{ ...before, status: 'open', note: 'launch' }]]);
    const svc = createServiceAreaService(db, createAuditService(db));
    const row = await svc.update('CA', { status: 'open', note: 'launch' }, actor);
    expect(row).toMatchObject({ status: 'open' });
    const set = log.find((l) => l.op === 'update.set')!.args[0] as Record<string, unknown>;
    expect(set).toMatchObject({ status: 'open', note: 'launch', updatedBy: 'user_admin' });
    const audit = log.find((l) => l.op === 'insert.values')!.args[0];
    expect(audit).toMatchObject({
      action: 'service_area.update',
      entityType: 'service_area',
      entityId: 'CA',
      before: { status: 'notify', note: null },
      after: { status: 'open', note: 'launch' },
    });
  });

  test('update of an unknown state is a null, not a write', async () => {
    const { db, log } = stubDb([[]]);
    const svc = createServiceAreaService(db, createAuditService(db));
    expect(await svc.update('ZZ', { status: 'open' }, actor)).toBeNull();
    expect(log.filter((l) => l.op === 'update')).toEqual([]);
  });
});

describe('service area requests', () => {
  test('first request inserts and syncs; a repeat returns the existing row without a write', async () => {
    const marketingCalls: unknown[] = [];
    const row = { id: 'r1', email: 'a@example.com', firstName: null, stateCode: 'NY', createdAt: new Date() };
    const { db, log } = stubDb([[], [row]], [[row]]);
    const svc = createServiceAreaRequestService(db, {
      marketing: { serviceAreaRequested: async (p) => void marketingCalls.push(p), intakeCompleted: async () => {} },
    });
    const first = await svc.request({ email: 'a@example.com', stateCode: 'NY' });
    expect(first.created).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(marketingCalls).toHaveLength(1);
    expect(marketingCalls[0]).toMatchObject({ email: 'a@example.com', stateCode: 'NY', goal: null });
    const second = await svc.request({ email: 'a@example.com', stateCode: 'NY' });
    expect(second.created).toBe(false);
    expect(log.filter((l) => l.op === 'insert')).toHaveLength(1);
  });
});

describe('onboarding config', () => {
  test('resolves defaults over a missing or invalid row, and merges patches', async () => {
    const { db } = stubDb([[], [{ value: { minimumAge: 'nope' } }]]);
    const svc = createOnboardingConfigService(db, createAuditService(db), { cacheTtlMs: 0 });
    expect(await svc.get()).toEqual({ minimumAge: 18 });
    expect(await svc.get()).toEqual({ minimumAge: 18 });
  });

  test('update audits onboarding.settings and returns the resolved settings', async () => {
    const { db, log } = stubDb([[{ value: { minimumAge: 18 } }]]);
    const svc = createOnboardingConfigService(db, createAuditService(db));
    const after = await svc.update({ minimumAge: 21 }, actor);
    expect(after).toEqual({ minimumAge: 21 });
    const audit = log.filter((l) => l.op === 'insert.values').map((l) => l.args[0] as Record<string, unknown>).find((a) => a.action === 'onboarding.settings');
    expect(audit).toMatchObject({ before: { minimumAge: 18 }, after: { minimumAge: 21 }, entityId: 'onboarding' });
  });
});
