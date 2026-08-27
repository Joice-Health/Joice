import { describe, expect, test } from 'bun:test';
import type { Database, OnboardingFlowVersion } from '@joice/db';
import { createAuditService } from '../admin/audit-service';
import { DEFAULT_INTAKE_FLOW } from './default-flow';
import { FlowServiceError, createFlowService } from './flow-service';

/**
 * A recording stub: every select resolves to the next queued row set, every
 * mutation records its call and resolves to the next queued returning row
 * (or `[{ id: 'row' }]`). Tests assert what was written and audited.
 */
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
    for (const name of ['from', 'where', 'orderBy', 'limit', 'values', 'set', 'returning', 'onConflictDoUpdate']) chain[name] = step(name);
    chain.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve(resolveTo()).then(onOk, onErr);
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
const flowRow = { id: 'flow-1', key: 'intake', name: 'Intake', publishedVersionId: 'v1', createdAt: new Date(), updatedAt: new Date() };
const version = (over: Partial<OnboardingFlowVersion>): OnboardingFlowVersion => ({
  id: 'v1',
  flowId: 'flow-1',
  version: 1,
  status: 'published',
  schemaVersion: 1,
  definition: DEFAULT_INTAKE_FLOW as unknown as Record<string, unknown>,
  logicHash: 'hash',
  notes: null,
  validationReport: null,
  createdBy: 'system',
  publishedBy: 'system',
  publishedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('flow service', () => {
  test('getPublished reads the pointer once and caches', async () => {
    const { db, log } = stubDb([[flowRow], [version({})]]);
    let clock = 0;
    const flows = createFlowService(db, createAuditService(db), { phiEnabled: () => false, now: () => clock });
    const a = await flows.getPublished();
    expect(a.version.id).toBe('v1');
    expect(a.definition.key).toBe('intake');
    const selectsBefore = log.filter((l) => l.op === 'select').length;
    await flows.getPublished();
    expect(log.filter((l) => l.op === 'select').length).toBe(selectsBefore);
    clock = 31_000;
    await expect(flows.getPublished()).rejects.toBeInstanceOf(FlowServiceError); // queue empty: nothing published
  });

  test('a definition from a newer schema version is refused, not served', async () => {
    const { db } = stubDb([[flowRow], [version({ schemaVersion: 2 })]]);
    const flows = createFlowService(db, createAuditService(db), { phiEnabled: () => false });
    await expect(flows.getPublished()).rejects.toMatchObject({ code: 'unreadable' });
  });

  test('publish refuses an invalid draft with the report and writes nothing', async () => {
    const broken = structuredClone(DEFAULT_INTAKE_FLOW) as Record<string, unknown>;
    (broken.sections as unknown[]).shift(); // eligibility removed
    const { db, log } = stubDb([[version({ id: 'v2', version: 2, status: 'draft', definition: broken })]]);
    const flows = createFlowService(db, createAuditService(db), { phiEnabled: () => false });
    const result = await flows.publish('v2', actor);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.report.errors.map((e) => e.code)).toContain('locked_section_missing');
    expect(log.filter((l) => l.op === 'update' || l.op === 'insert')).toEqual([]);
  });

  test('publish freezes the draft, archives the previous version, moves the pointer and audits', async () => {
    const draft = version({ id: 'v2', version: 2, status: 'draft', logicHash: null, publishedAt: null, publishedBy: null });
    const { db, log } = stubDb(
      [[draft], [flowRow]],
      [[{ ...draft, status: 'published' }], [{ id: 'v1' }], [{ id: 'flow-1' }]],
    );
    const flows = createFlowService(db, createAuditService(db), { phiEnabled: () => false });
    const result = await flows.publish('v2', actor, { notes: 'second' });
    expect(result.ok).toBe(true);
    const sets = log.filter((l) => l.op === 'update.set').map((l) => l.args[0] as Record<string, unknown>);
    expect(sets[0]).toMatchObject({ status: 'published', publishedBy: 'user_admin', notes: 'second' });
    expect(typeof sets[0]!.logicHash).toBe('string');
    expect(sets[1]).toMatchObject({ status: 'archived' });
    expect(sets[2]).toMatchObject({ publishedVersionId: 'v2' });
    const audit = log.find((l) => l.op === 'insert.values' && (l.args[0] as { action?: string }).action === 'onboarding.publish')!;
    expect(audit.args[0]).toMatchObject({
      action: 'onboarding.publish',
      entityType: 'onboarding_flow',
      entityId: 'intake',
      before: { publishedVersionId: 'v1' },
    });
  });

  test('publish awaits an async phiEnabled and succeeds with both keys on', async () => {
    // The api hands the service an async closure over the env key and the
    // feature flag; the unlocked path must await it, not truthy-check the promise.
    const draft = version({ id: 'v2', version: 2, status: 'draft', logicHash: null, publishedAt: null, publishedBy: null });
    const { db, log } = stubDb(
      [[draft], [flowRow]],
      [[{ ...draft, status: 'published' }], [{ id: 'v1' }], [{ id: 'flow-1' }]],
    );
    const flows = createFlowService(db, createAuditService(db), { phiEnabled: async () => true });
    const result = await flows.publish('v2', actor);
    expect(result.ok).toBe(true);
    expect(log.filter((l) => l.op === 'update.set').length).toBeGreaterThan(0);
  });

  test('publish and rollback refuse the wrong statuses', async () => {
    const { db } = stubDb([[version({ status: 'published' })]]);
    const flows = createFlowService(db, createAuditService(db), { phiEnabled: () => false });
    await expect(flows.publish('v1', actor)).rejects.toMatchObject({ code: 'not_publishable' });
    const { db: db2 } = stubDb([[flowRow], [version({ id: 'v3', status: 'draft' })]]);
    const flows2 = createFlowService(db2, createAuditService(db2), { phiEnabled: () => false });
    await expect(flows2.rollback('intake', 'v3', actor)).rejects.toMatchObject({ code: 'not_publishable' });
  });

  test('saveDraft stores the definition with its live report and refuses non-drafts', async () => {
    const draft = version({ id: 'v2', version: 2, status: 'draft' });
    const edited = structuredClone(DEFAULT_INTAKE_FLOW) as Record<string, unknown>;
    (edited as { copy: Record<string, string> }).copy['intro.title'] = 'Hello.';
    const { db, log } = stubDb([[draft]], [[{ ...draft, definition: edited }]]);
    const flows = createFlowService(db, createAuditService(db), { phiEnabled: () => false });
    const { report } = await flows.saveDraft('v2', { definition: edited }, actor);
    expect(report.ok).toBe(true);
    const set = log.find((l) => l.op === 'update.set')!.args[0] as Record<string, unknown>;
    expect((set.definition as { copy: Record<string, string> }).copy['intro.title']).toBe('Hello.');
    expect((set.validationReport as { ok: boolean }).ok).toBe(true);

    const { db: db2 } = stubDb([[version({ status: 'published' })]]);
    const flows2 = createFlowService(db2, createAuditService(db2), { phiEnabled: () => false });
    await expect(flows2.saveDraft('v1', { definition: edited }, actor)).rejects.toMatchObject({ code: 'not_draft' });
  });
});
