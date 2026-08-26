import { describe, expect, test } from 'bun:test';
import type { Database } from '@joice/db';
import { createProfileService } from './profile-service';
import type { ProfileProjection } from './projector';

/**
 * A recording stub for the handful of drizzle calls the profile service
 * makes. Each call appends to `log` so tests can assert what was written,
 * never how; selects answer from `selectRows` in order.
 */
function stubDb(selectRows: unknown[][] = []) {
  const log: Array<{ op: string; args: unknown[] }> = [];
  const nextSelect = () => selectRows.shift() ?? [];
  const chain = (op: string, args: unknown[] = []): Record<string, unknown> => {
    log.push({ op, args });
    const p = Promise.resolve(op === 'select' ? nextSelect() : [{ id: 'row' }]) as Promise<unknown> &
      Record<string, unknown>;
    const more = (name: string) => (...a: unknown[]) => {
      log.push({ op: `${op}.${name}`, args: a });
      return p;
    };
    p.values = more('values');
    p.onConflictDoUpdate = more('onConflictDoUpdate');
    p.returning = more('returning');
    p.set = more('set');
    p.where = more('where');
    p.limit = more('limit');
    p.orderBy = more('orderBy');
    p.from = more('from');
    return p;
  };
  const db = {
    insert: (t: unknown) => chain('insert', [t]),
    update: (t: unknown) => chain('update', [t]),
    delete: (t: unknown) => chain('delete', [t]),
    select: (...a: unknown[]) => chain('select', a),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db: db as unknown as Database, log };
}

const projection: ProfileProjection = {
  traits: { goal: { value: 'energy', source: 'onboarding', observedAt: '2026-08-19T12:00:00.000Z' } },
  flat: { goal: 'energy' },
  segment: 'energy',
  trace: [],
  projectorVersion: 1,
  projectedAt: '2026-08-19T12:00:00.000Z',
};

describe('profile service', () => {
  test('recordObservations appends rows with defaults, and skips empty input', async () => {
    const { db, log } = stubDb();
    const svc = createProfileService(db);
    await svc.recordObservations([]);
    expect(log).toEqual([]);
    await svc.recordObservations([
      { trait: 'goal', value: 'energy', source: 'companion', onboardingSessionId: 's1', questionKey: 'goal' },
    ]);
    const values = log.find((l) => l.op === 'insert.values')!.args[0] as Array<Record<string, unknown>>;
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({
      trait: 'goal',
      value: 'energy',
      source: 'companion',
      confidence: 1,
      onboardingSessionId: 's1',
      memberId: null,
      flowVersionId: null,
      questionKey: 'goal',
    });
    expect(values[0]!.observedAt).toBeInstanceOf(Date);
  });

  test('upsertProjection keys by session or member and writes the fold', async () => {
    const { db, log } = stubDb();
    const svc = createProfileService(db);
    await svc.upsertProjection({ anonymousSessionId: 'anon-1' }, projection, 'v1');
    const anon = log.find((l) => l.op === 'insert.values')!.args[0] as Record<string, unknown>;
    expect(anon).toMatchObject({ anonymousSessionId: 'anon-1', memberId: null, segment: 'energy', flowVersionId: 'v1', projectorVersion: 1 });
    log.length = 0;
    await svc.upsertProjection({ memberId: 'm-1' }, projection);
    const member = log.find((l) => l.op === 'insert.values')!.args[0] as Record<string, unknown>;
    expect(member).toMatchObject({ memberId: 'm-1', anonymousSessionId: null, flowVersionId: null });
    const conflict = log.find((l) => l.op === 'insert.onConflictDoUpdate')!.args[0] as { set: Record<string, unknown> };
    expect(conflict.set).toMatchObject({ segment: 'energy', traits: projection.traits });
    expect(conflict.set.memberId).toBeUndefined();
  });

  test('listObservations with no filter queries nothing', async () => {
    const { db, log } = stubDb();
    expect(await createProfileService(db).listObservations({})).toEqual([]);
    expect(log).toEqual([]);
  });

  test('attachToMember re-keys the anonymous profile when the member has none', async () => {
    const { db, log } = stubDb([[]]); // the member-profile lookup finds nothing
    const result = await createProfileService(db).attachToMember({
      onboardingSessionId: 's1',
      anonymousSessionId: 'anon-1',
      memberId: 'm-1',
    });
    expect(result).toEqual({ reproject: false });
    const ops = log.map((l) => l.op);
    expect(ops).toContain('update.set');
    expect(ops).not.toContain('delete');
    const sets = log.filter((l) => l.op === 'update.set').map((l) => l.args[0] as Record<string, unknown>);
    expect(sets[0]).toEqual({ memberId: 'm-1' }); // observations stamped
    expect(sets[1]).toMatchObject({ memberId: 'm-1', anonymousSessionId: null }); // profile re-keyed
  });

  test('attachToMember drops the anonymous profile when the member already has one', async () => {
    const { db, log } = stubDb([[{ id: 'existing' }]]);
    const result = await createProfileService(db).attachToMember({
      onboardingSessionId: 's1',
      anonymousSessionId: 'anon-1',
      memberId: 'm-1',
    });
    expect(result).toEqual({ reproject: true });
    expect(log.map((l) => l.op)).toContain('delete');
    expect(log.filter((l) => l.op === 'update.set')).toHaveLength(1); // only the observation stamp
  });
});
