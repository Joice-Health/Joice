import { describe, expect, test } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { evalCases, evalResults, evalRuns, type Database, type EvalCase } from '@joice/db';
import { DEFAULT_BRAIN_SETTINGS, type ResolvedBrainConfig } from '../config/schemas';
import type { RecommendationStreamEvent } from '../generation/answer-service';
import { ActiveEvalRunError, NoEvalCasesError, createEvalService } from './service';

/**
 * The engine's contract, pinned without Postgres or Bedrock: config
 * snapshotting, the 409 mapping, the stale sweep, sequential execution with
 * per-case timeouts, and honest finalization. The db stub routes by table
 * identity (the real imported table objects), the pipeline stub scripts
 * stream events per question, the same way answer-service tests do.
 */

type Row = Record<string, unknown>;

function stubDb() {
  const state = {
    caseRows: [] as Row[],
    runRows: [] as Row[],
    previousRows: [] as Row[],
    resultRows: [] as Row[],
    runInserts: [] as Row[],
    resultInserts: [] as Row[],
    updates: [] as { table: unknown; set: Row; where: unknown }[],
    limits: [] as number[],
    failRunInsert: null as Record<string, unknown> | null,
    seq: 0,
  };

  const thenable = (rowsFn: () => Row[]) => ({
    then: (resolve: (rows: Row[]) => void) => resolve(rowsFn()),
    catch: () => undefined,
    returning: () => Promise.resolve(rowsFn()),
  });

  const selectChain = (rowsFn: () => Row[]): Record<string, unknown> => ({
    where: () => selectChain(rowsFn),
    orderBy: () => selectChain(rowsFn),
    limit: (n: number) => {
      state.limits.push(n);
      return selectChain(rowsFn);
    },
    offset: () => selectChain(rowsFn),
    then: (resolve: (rows: Row[]) => void) => resolve(rowsFn()),
  });

  const db = {
    select: (fields?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        if (table === evalCases) return selectChain(() => state.caseRows.slice());
        if (table === evalResults) return selectChain(() => state.resultRows.slice());
        if (fields && 'value' in fields) {
          return selectChain(() => [{ value: state.runRows.length }]);
        }
        if (fields && 'id' in fields) return selectChain(() => state.previousRows.slice());
        return selectChain(() => state.runRows.slice());
      },
    }),
    insert: (table: unknown) => ({
      values: (v: Row) => {
        if (table === evalRuns) {
          if (state.failRunInsert) {
            throw Object.assign(new Error('duplicate'), state.failRunInsert);
          }
          const row = {
            id: `run-${++state.seq}`,
            status: 'running',
            startedAt: new Date(0),
            finishedAt: null,
            error: null,
            ...v,
          };
          state.runInserts.push(row);
          return thenable(() => [row]);
        }
        state.resultInserts.push(v);
        return thenable(() => [v]);
      },
    }),
    update: (table: unknown) => ({
      set: (set: Row) => ({
        where: (where: unknown) => {
          state.updates.push({ table, set, where });
          return thenable(() =>
            state.caseRows.length ? [{ ...state.caseRows[0], ...set }] : [],
          );
        },
      }),
    }),
    delete: () => ({
      where: () => ({
        returning: () => Promise.resolve(state.caseRows.splice(0).map((r) => ({ id: r.id }))),
      }),
    }),
  };
  return { db: db as unknown as Database, state };
}

const caseOf = (over: Partial<EvalCase> = {}): EvalCase =>
  ({
    id: `case-${Math.random().toString(36).slice(2, 8)}`,
    question: 'How is BPC-157 dosed?',
    expectSources: null,
    expectRefusal: false,
    expectTool: null,
    mustCite: false,
    enabled: true,
    tags: [],
    notes: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  }) as EvalCase;

const config = (over: Partial<ResolvedBrainConfig> = {}): ResolvedBrainConfig => ({
  ...DEFAULT_BRAIN_SETTINGS,
  model: 'test-model',
  pollyVoiceId: 'Ruth',
  ...over,
});

const completeEvent = (
  over: { answer?: string; citations?: { sourcePath: string }[]; usage?: { inputTokens: number; outputTokens: number } } = {},
): RecommendationStreamEvent => ({
  type: 'complete',
  recommendation: {
    answer: over.answer ?? 'An answer [1].',
    citations: (over.citations ?? [{ sourcePath: 'a.md' }]).map((c, i) => ({
      index: i + 1,
      sourcePath: c.sourcePath,
      headingPath: null,
      citedText: 'x',
    })),
  },
  ...(over.usage ? { usage: over.usage } : {}),
});

/** Streams keyed by question; an unknown question hangs forever (timeout tests). */
function scriptedPipeline(script: Record<string, RecommendationStreamEvent[]>) {
  return {
    retrieve: async () => [],
    recommendStream: (messages: { content: string }[]) =>
      (async function* (): AsyncGenerator<RecommendationStreamEvent> {
        const events = script[messages[0]!.content];
        if (!events) {
          await new Promise(() => {});
          return;
        }
        for (const event of events) yield event;
      })(),
  };
}

const flush = async (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe('startRun', () => {
  test('pins showCitations, merges defined overrides into the snapshot, records what was applied', async () => {
    const { db, state } = stubDb();
    state.caseRows = [caseOf({ question: 'q1', expectSources: ['a.md'] })];
    const service = createEvalService(db, {
      getConfig: async () => config({ showCitations: false, model: 'nova', toolsEnabled: false }),
      buildService: () => scriptedPipeline({ q1: [completeEvent()] }),
    });

    const run = await service.startRun({
      mode: 'full',
      overrides: { model: 'claude', toolsEnabled: true, topK: undefined },
      triggeredBy: 'user_1',
      triggeredByEmail: 'shaun@joicehealth.com',
    });

    const inserted = state.runInserts[0]!;
    expect(run.id).toBe(inserted.id as string);
    const snapshot = inserted.configSnapshot as ResolvedBrainConfig;
    expect(snapshot.showCitations).toBe(true); // pinned, whatever the settings say
    expect(snapshot.model).toBe('claude');
    expect(inserted.overridesApplied).toEqual({ model: 'claude', toolsEnabled: true });
    expect(inserted.model).toBe('claude');
    expect(inserted.toolsEnabled).toBe(true);
    expect(inserted.totalCases).toBe(1);
    await flush();
  });

  test('a unique violation on the running guard maps to ActiveEvalRunError', async () => {
    const { db, state } = stubDb();
    state.caseRows = [caseOf()];
    state.failRunInsert = { code: '23505' };
    const service = createEvalService(db, {
      getConfig: async () => config(),
      buildService: () => scriptedPipeline({}),
    });

    await expect(
      service.startRun({ mode: 'retrieval', overrides: {}, triggeredBy: 'u' }),
    ).rejects.toBeInstanceOf(ActiveEvalRunError);
  });

  test('zero enabled cases refuses to start', async () => {
    const { db } = stubDb();
    const service = createEvalService(db, {
      getConfig: async () => config(),
      buildService: () => scriptedPipeline({}),
    });
    await expect(
      service.startRun({ mode: 'full', overrides: {}, triggeredBy: 'u' }),
    ).rejects.toBeInstanceOf(NoEvalCasesError);
  });

  test('the case query is capped at MAX_ENABLED_CASES', async () => {
    const { db, state } = stubDb();
    state.caseRows = [caseOf({ question: 'q1' })];
    const service = createEvalService(db, {
      getConfig: async () => config(),
      buildService: () => scriptedPipeline({ q1: [completeEvent()] }),
    });
    await service.startRun({ mode: 'full', overrides: {}, triggeredBy: 'u' });
    expect(state.limits).toContain(100);
    await flush();
  });
});

describe('the executor', () => {
  test('runs cases sequentially, inserts one result per case, finalizes totals and tokens', async () => {
    const { db, state } = stubDb();
    state.caseRows = [
      caseOf({ id: 'c1', question: 'q1', expectSources: ['a.md'] }),
      caseOf({ id: 'c2', question: 'q2', mustCite: true }),
    ];
    const service = createEvalService(db, {
      getConfig: async () => config(),
      buildService: () =>
        scriptedPipeline({
          q1: [
            { type: 'delta', text: 'An' },
            completeEvent({ usage: { inputTokens: 100, outputTokens: 20 } }),
          ],
          q2: [completeEvent({ citations: [] })], // mustCite fails
        }),
    });

    await service.startRun({ mode: 'full', overrides: {}, triggeredBy: 'u' });
    await flush();
    await flush();

    expect(state.resultInserts.map((r) => r.question)).toEqual(['q1', 'q2']);
    expect(state.resultInserts[0]).toMatchObject({ caseId: 'c1', pass: true });
    expect(state.resultInserts[0]!.inputTokens).toBe(100);
    expect(state.resultInserts[1]).toMatchObject({
      caseId: 'c2',
      pass: false,
      detail: 'expected citations, got none',
    });

    const finalize = state.updates.find((u) => u.table === evalRuns && u.set.status === 'completed');
    expect(finalize).toBeDefined();
    expect(finalize!.set).toMatchObject({
      passedCases: 1,
      failedCases: 1,
      inputTokens: 100,
      outputTokens: 20,
    });
    expect(finalize!.set.finishedAt).toBeInstanceOf(Date);
  });

  test('a hung case times out, records a failed result, and the run continues', async () => {
    const { db, state } = stubDb();
    state.caseRows = [
      caseOf({ id: 'c1', question: 'hangs forever' }),
      caseOf({ id: 'c2', question: 'q2', expectSources: ['a.md'] }),
    ];
    const service = createEvalService(db, {
      getConfig: async () => config(),
      buildService: () => scriptedPipeline({ q2: [completeEvent()] }),
      caseTimeoutMs: 20,
    });

    await service.startRun({ mode: 'full', overrides: {}, triggeredBy: 'u' });
    await flush(60);

    expect(state.resultInserts[0]).toMatchObject({ caseId: 'c1', pass: false });
    expect(state.resultInserts[0]!.detail as string).toContain('timeout');
    expect(state.resultInserts[1]).toMatchObject({ caseId: 'c2', pass: true });
    expect(
      state.updates.some((u) => u.table === evalRuns && u.set.status === 'completed'),
    ).toBe(true);
  });

  test('an executor failure marks the run failed with the error, never silently', async () => {
    const { db, state } = stubDb();
    state.caseRows = [caseOf({ question: 'q1' })];
    const service = createEvalService(db, {
      getConfig: async () => config(),
      buildService: () => {
        throw new Error('bedrock exploded');
      },
    });

    await service.startRun({ mode: 'full', overrides: {}, triggeredBy: 'u' });
    await flush();

    // The stale sweep also writes status failed, so match on the message.
    const failed = state.updates.filter(
      (u) => u.table === evalRuns && u.set.status === 'failed',
    );
    expect(failed.some((u) => (u.set.error as string).includes('bedrock exploded'))).toBe(true);
  });
});

describe('the stale sweep', () => {
  test('reads sweep lost runs: still running, old, and silent inside the window', async () => {
    const { db, state } = stubDb();
    const service = createEvalService(db, {
      getConfig: async () => config(),
      buildService: () => scriptedPipeline({}),
      staleRunMs: 15 * 60_000,
      now: () => new Date(1_000_000_000),
    });

    await service.listRuns({ page: 1, limit: 20 });

    const sweep = state.updates.find((u) => u.table === evalRuns && u.set.status === 'failed');
    expect(sweep).toBeDefined();
    expect(sweep!.set.error as string).toContain('stale');
    const rendered = new PgDialect().sqlToQuery(sweep!.where as SQL);
    expect(rendered.sql).toContain('NOT EXISTS');
    expect(rendered.params).toContain('running');
    // The injectable clock decides the cutoff that rides in the where.
    const cutoffs = rendered.params.filter(
      (p) => p instanceof Date && p.getTime() === 1_000_000_000 - 15 * 60_000,
    );
    expect(cutoffs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('getRun', () => {
  test('returns the run, its results, and the previous completed run of the same mode', async () => {
    const { db, state } = stubDb();
    state.runRows = [
      { id: 'run-9', mode: 'full', status: 'completed', startedAt: new Date(5000) },
    ];
    state.previousRows = [{ id: 'run-8' }];
    state.resultRows = [{ id: 'r1', runId: 'run-9', question: 'q1', pass: true }];
    const service = createEvalService(db, {
      getConfig: async () => config(),
      buildService: () => scriptedPipeline({}),
    });

    const detail = await service.getRun('run-9');
    expect(detail?.run.id).toBe('run-9');
    expect(detail?.results).toHaveLength(1);
    expect(detail?.previousRunId).toBe('run-8');
  });

  test('an unknown run is null, not an error', async () => {
    const { db } = stubDb();
    const service = createEvalService(db, {
      getConfig: async () => config(),
      buildService: () => scriptedPipeline({}),
    });
    expect(await service.getRun('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
