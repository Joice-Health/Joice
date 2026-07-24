import { describe, expect, test } from 'bun:test';
import type { Database } from '@joice/db';
import { createProfileService, ProfileValidationError, captureStepFor } from './service';
import type { Requester } from '../ports';

/**
 * The capture flow is a deterministic state machine, so these tests assert the
 * two things that decide whether it behaves: which field it asks for next given
 * a row, and whether an answer is accepted or rejected. A tiny in-memory stub
 * stands in for Postgres — one row per session, upserted.
 */

type Row = {
  id: string;
  memberId: string | null;
  anonymousSessionId: string | null;
  name: string | null;
  email: string | null;
  goal: string | null;
  goalNote: string | null;
  skipped: string[];
  readyForOnboarding: boolean;
  status: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function stubDb() {
  const rows: Row[] = [];
  let seq = 0;
  const fresh = 0; // fixed timestamp — Date.now() is unavailable in some contexts

  const chain = (result: () => Row[]) => ({
    from: () => chain(result),
    where: () => chain(result),
    orderBy: () => chain(result),
    limit: () => Promise.resolve(result()),
    returning: () => Promise.resolve(result()),
  });

  const db = {
    select: () => chain(() => rows.slice()),
    insert: () => ({
      values: (v: Partial<Row>) => ({
        returning: () => {
          const row: Row = {
            id: `p${++seq}`,
            memberId: v.memberId ?? null,
            anonymousSessionId: v.anonymousSessionId ?? null,
            name: null,
            email: null,
            goal: null,
            goalNote: null,
            skipped: [],
            readyForOnboarding: false,
            status: 'capturing',
            metadata: null,
            createdAt: new Date(fresh),
            updatedAt: new Date(fresh),
          };
          rows.push(row);
          return Promise.resolve([row]);
        },
      }),
    }),
    update: () => ({
      set: (patch: Partial<Row>) => ({
        where: () => ({
          returning: () => {
            // The service updates by id; there's only ever one row in these tests.
            Object.assign(rows[0]!, patch);
            return Promise.resolve([rows[0]!]);
          },
        }),
      }),
    }),
  };
  return { db: db as unknown as Database, rows };
}

const anon: Requester = { memberId: null, sessionId: 'sess-1' };

describe('nextField order', () => {
  test('asks name, then email, then goal, then nothing', async () => {
    const { db } = stubDb();
    const svc = createProfileService(db);

    let row = await svc.get(anon);
    expect(svc.nextField(row)).toBe('name');

    row = await svc.applyField(anon, 'name', 'Shaun');
    expect(svc.nextField(row)).toBe('email');

    row = await svc.applyField(anon, 'email', 'shaun@example.com');
    expect(svc.nextField(row)).toBe('goal');

    row = await svc.applyField(anon, 'goal', 'weight-metabolic');
    expect(svc.nextField(row)).toBeNull();
  });

  test('a skipped field is settled — never asked again', async () => {
    const { db } = stubDb();
    const svc = createProfileService(db);
    await svc.get(anon);

    let row = await svc.skip(anon, 'email');
    expect(row.skipped).toContain('email');
    // name still pending, email settled by skip, so next is name then goal.
    expect(svc.nextField(row)).toBe('name');
    row = await svc.applyField(anon, 'name', 'Dana');
    expect(svc.nextField(row)).toBe('goal');
  });
});

describe('status projection', () => {
  test('stays capturing until every field is settled, then exploring', async () => {
    const { db } = stubDb();
    const svc = createProfileService(db);
    await svc.get(anon);

    let row = await svc.applyField(anon, 'name', 'Shaun');
    expect(row.status).toBe('capturing');
    row = await svc.applyField(anon, 'email', 'shaun@example.com');
    expect(row.status).toBe('capturing');
    // The last field flips it immediately — no one-interaction lag.
    row = await svc.applyField(anon, 'goal', 'energy');
    expect(row.status).toBe('exploring');
  });

  test('skipping the remaining fields also completes capture', async () => {
    const { db } = stubDb();
    const svc = createProfileService(db);
    await svc.get(anon);
    await svc.skip(anon, 'name');
    await svc.skip(anon, 'email');
    const row = await svc.skip(anon, 'goal');
    expect(row.status).toBe('exploring');
    expect(svc.nextField(row)).toBeNull();
  });

  test('markReady sets the lead signal and never downgrades', async () => {
    const { db } = stubDb();
    const svc = createProfileService(db);
    await svc.get(anon);
    let row = await svc.markReady(anon);
    expect(row.readyForOnboarding).toBe(true);
    expect(row.status).toBe('ready');
    // A later field answer must not knock it back to capturing/exploring.
    row = await svc.applyField(anon, 'name', 'Shaun');
    expect(row.status).toBe('ready');
  });
});

describe('validation', () => {
  test('rejects a non-email in the email field', async () => {
    const { db } = stubDb();
    const svc = createProfileService(db);
    await svc.get(anon);
    await expect(svc.applyField(anon, 'email', 'what is bpc-157?')).rejects.toBeInstanceOf(
      ProfileValidationError,
    );
  });

  test('accepts and lowercases a valid email', async () => {
    const { db } = stubDb();
    const svc = createProfileService(db);
    await svc.get(anon);
    const row = await svc.applyField(anon, 'email', 'Shaun@Example.COM');
    expect(row.email).toBe('shaun@example.com');
  });

  test('rejects a goal outside the vocabulary', async () => {
    const { db } = stubDb();
    const svc = createProfileService(db);
    await svc.get(anon);
    await expect(svc.applyField(anon, 'goal', 'cognitive')).rejects.toBeInstanceOf(
      ProfileValidationError,
    );
  });

  test('accepts "not sure" as a goal', async () => {
    const { db } = stubDb();
    const svc = createProfileService(db);
    await svc.get(anon);
    const row = await svc.applyField(anon, 'goal', 'not-sure', 'still reading');
    expect(row.goal).toBe('not-sure');
    expect(row.goalNote).toBe('still reading');
  });

  test('an empty name is rejected', async () => {
    const { db } = stubDb();
    const svc = createProfileService(db);
    await svc.get(anon);
    await expect(svc.applyField(anon, 'name', '   ')).rejects.toBeInstanceOf(ProfileValidationError);
  });
});

describe('toView', () => {
  test('maps a goal slug to its human label', async () => {
    const { db } = stubDb();
    const svc = createProfileService(db);
    await svc.get(anon);
    const row = await svc.applyField(anon, 'goal', 'weight-metabolic');
    expect(svc.toView(row).goalLabel).toBe('Weight & metabolic');
  });
});

describe('captureStepFor', () => {
  const prompts = { name: 'Name?', email: 'Email?', goal: 'Goal?' };

  test('goal renders as choice chips including the five areas and "not sure"', () => {
    const step = captureStepFor('goal', prompts);
    expect(step.input.type).toBe('choice');
    const values = step.input.choices!.map((c) => c.value);
    expect(values).toContain('weight-metabolic');
    expect(values).toContain('not-sure');
    expect(values).toHaveLength(6);
  });

  test('email renders as an email input', () => {
    expect(captureStepFor('email', prompts).input.type).toBe('email');
  });
});
