import {
  and,
  asc,
  count,
  desc,
  eq,
  evalCases,
  evalResults,
  evalRuns,
  lt,
  sql,
  type Database,
  type EvalCase,
  type EvalResult,
  type EvalRun,
} from '@joice/db';
import type { ResolvedBrainConfig } from '../config/schemas';
import type { RecommendationService, RecommendationStreamEvent } from '../generation/answer-service';
import type { ChatMessage } from '../conversation/schemas';
import { MAX_ENABLED_CASES, type EvalCaseInput, type EvalCasePatch, type EvalRunMode } from './schemas';
import { percentile, scoreFullCase, scoreRetrievalCase, type CaseScore } from './scoring';

/**
 * The eval console's engine: golden-set CRUD, and runs that execute
 * fire-and-forget on this task while results land row by row.
 *
 * Concurrency: the one-active-run guard is the partial unique index
 * `eval_runs_one_running_unique` (at most one row with status 'running').
 * The database is the only race-free place for this, because the executor
 * lives inside one ECS task and tasks scale out; any in-memory lock would
 * multiply per task. A second start attempt surfaces here as a unique
 * violation and is rethrown as ActiveEvalRunError (the route's 409).
 *
 * Lifecycle safety: a deploy can kill the executor mid-run, leaving a row
 * 'running' forever and wedging the guard. The stale sweep runs on reads as
 * well as on start, so the next admin page load heals it. Staleness keys on
 * the LAST RESULT INSERT, not the start time: an honest 100-case tools run
 * can outlive any fixed wall clock while still producing rows.
 */

/** A run is already in flight; the route maps this to 409. */
export class ActiveEvalRunError extends Error {
  constructor() {
    super('An eval run is already in progress');
    this.name = 'ActiveEvalRunError';
  }
}

/** Nothing enabled to run; the route maps this to 400. */
export class NoEvalCasesError extends Error {
  constructor() {
    super('No enabled eval cases to run');
    this.name = 'NoEvalCasesError';
  }
}

/** A question's answer exceeded its time budget. Internal to the executor. */
class CaseTimeoutError extends Error {
  constructor(ms: number) {
    super(`timeout after ${Math.round(ms / 1000)}s`);
    this.name = 'CaseTimeoutError';
  }
}

export interface EvalServiceDeps {
  getConfig: () => Promise<ResolvedBrainConfig>;
  /** A pipeline pinned to the run's effective config (built once per run). */
  buildService: (
    config: ResolvedBrainConfig,
  ) => Pick<RecommendationService, 'retrieve' | 'recommendStream'>;
  caseTimeoutMs?: number;
  staleRunMs?: number;
  now?: () => Date;
}

interface CaseOutcome extends CaseScore {
  answer?: string;
  citations?: unknown[];
  toolsCalled?: string[];
  firstTokenMs?: number;
  totalMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}

/** Postgres unique violation, tolerant of driver nesting. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

export function createEvalService(db: Database, deps: EvalServiceDeps) {
  const caseTimeoutMs = deps.caseTimeoutMs ?? 60_000;
  const staleRunMs = deps.staleRunMs ?? 15 * 60_000;
  const now = deps.now ?? (() => new Date());

  /**
   * Flip lost runs to failed: still 'running', started before the stale
   * window, and no result row inserted inside it. Called from reads too, so
   * a wedged guard heals on the next page load instead of the next attempt.
   */
  async function sweepStaleRuns(): Promise<void> {
    const cutoff = new Date(now().getTime() - staleRunMs);
    await db
      .update(evalRuns)
      .set({
        status: 'failed',
        error: 'stale: executor lost, the task was likely recycled mid-run',
        finishedAt: now(),
      })
      .where(
        and(
          eq(evalRuns.status, 'running'),
          lt(evalRuns.startedAt, cutoff),
          sql`NOT EXISTS (SELECT 1 FROM ${evalResults} WHERE ${evalResults.runId} = ${evalRuns.id} AND ${evalResults.createdAt} > ${cutoff})`,
        ),
      );
  }

  async function runRetrievalCase(
    service: Pick<RecommendationService, 'retrieve'>,
    config: ResolvedBrainConfig,
    c: EvalCase,
  ): Promise<CaseOutcome> {
    const started = performance.now();
    const chunks = await service.retrieve(c.question, config);
    const paths = new Set(chunks.map((chunk) => chunk.sourcePath));
    const score = scoreRetrievalCase(c, paths, config.topK);
    return {
      ...score,
      // The retrieved set, kept inspectable without storing chunk bodies.
      citations: chunks.map((chunk) => ({
        sourcePath: chunk.sourcePath,
        headingPath: chunk.headingPath,
        similarity: chunk.similarity,
      })),
      totalMs: Math.round(performance.now() - started),
    };
  }

  /**
   * One timer per case, cancellable, rejection pre-observed: racing a fresh
   * setTimeout against every stream event would leak a timer (and later an
   * unhandled rejection) per event.
   */
  function caseTimeout(ms: number): { promise: Promise<never>; cancel: () => void } {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new CaseTimeoutError(ms)), ms);
    });
    promise.catch(() => {}); // observed even when the race is already won
    return { promise, cancel: () => clearTimeout(timer) };
  }

  async function runFullCase(
    service: Pick<RecommendationService, 'recommendStream'>,
    config: ResolvedBrainConfig,
    c: EvalCase,
    timeout: Promise<never>,
  ): Promise<CaseOutcome> {
    const started = performance.now();
    let firstTokenMs: number | undefined;
    const toolsCalled = new Set<string>();
    let complete: Extract<RecommendationStreamEvent, { type: 'complete' }> | undefined;

    const messages: ChatMessage[] = [{ role: 'user', content: c.question }];
    const iterator = service.recommendStream(messages)[Symbol.asyncIterator]();
    try {
      for (;;) {
        const step = await Promise.race([iterator.next(), timeout]);
        if (step.done) break;
        const event = step.value;
        if (event.type === 'delta' && firstTokenMs === undefined) {
          firstTokenMs = Math.round(performance.now() - started);
        } else if (event.type === 'tool' && event.status === 'started') {
          toolsCalled.add(event.name);
        } else if (event.type === 'complete') {
          complete = event;
        }
      }
    } catch (err) {
      // A timed-out generator must be closed, or its Bedrock stream keeps
      // billing with nobody reading it.
      void iterator.return?.(undefined as never)?.catch?.(() => {});
      throw err;
    }
    const totalMs = Math.round(performance.now() - started);
    if (!complete) return { pass: false, detail: 'stream ended without complete', totalMs };

    const citedPaths = new Set(complete.recommendation.citations.map((cit) => cit.sourcePath));
    const score = scoreFullCase(
      c,
      { answer: complete.recommendation.answer, citedPaths, toolsCalled },
      { notCoveredMessage: config.notCoveredMessage, toolsEnabled: config.toolsEnabled },
    );
    return {
      ...score,
      answer: complete.recommendation.answer,
      citations: complete.recommendation.citations,
      toolsCalled: [...toolsCalled],
      firstTokenMs,
      totalMs,
      inputTokens: complete.usage?.inputTokens,
      outputTokens: complete.usage?.outputTokens,
    };
  }

  /** Never throws: any failure becomes a failed result row and the run moves on. */
  async function runOneCase(
    service: Pick<RecommendationService, 'retrieve' | 'recommendStream'>,
    config: ResolvedBrainConfig,
    mode: EvalRunMode,
    c: EvalCase,
  ): Promise<CaseOutcome> {
    const timeout = caseTimeout(caseTimeoutMs);
    try {
      if (mode === 'retrieval') {
        return await Promise.race([runRetrievalCase(service, config, c), timeout.promise]);
      }
      return await runFullCase(service, config, c, timeout.promise);
    } catch (err) {
      const message =
        err instanceof CaseTimeoutError
          ? err.message
          : `case error: ${(err as Error)?.name ?? 'Error'}`;
      return { pass: false, detail: message };
    } finally {
      timeout.cancel();
    }
  }

  function executeRun(run: EvalRun, config: ResolvedBrainConfig, cases: EvalCase[]): void {
    // Fire-and-forget, the marketing-sync precedent: the status column is the
    // durable record; the catch below is the only thing that must not fail.
    void (async () => {
      const service = deps.buildService(config);
      const outcomes: CaseOutcome[] = [];
      for (const c of cases) {
        const outcome = await runOneCase(service, config, run.mode as EvalRunMode, c);
        outcomes.push(outcome);
        await db.insert(evalResults).values({
          runId: run.id,
          caseId: c.id,
          question: c.question,
          pass: outcome.pass,
          detail: outcome.detail,
          answer: outcome.answer,
          citations: outcome.citations,
          toolsCalled: outcome.toolsCalled,
          firstTokenMs: outcome.firstTokenMs,
          totalMs: outcome.totalMs,
          inputTokens: outcome.inputTokens,
          outputTokens: outcome.outputTokens,
        });
      }

      const passed = outcomes.filter((o) => o.pass).length;
      const firsts = outcomes
        .map((o) => o.firstTokenMs)
        .filter((n): n is number => n !== undefined)
        .sort((a, b) => a - b);
      const totals = outcomes
        .map((o) => o.totalMs)
        .filter((n): n is number => n !== undefined)
        .sort((a, b) => a - b);
      const tokenSum = (pick: (o: CaseOutcome) => number | undefined) => {
        const values = outcomes.map(pick).filter((n): n is number => n !== undefined);
        return values.length > 0 ? values.reduce((a, b) => a + b, 0) : null;
      };

      await db
        .update(evalRuns)
        .set({
          status: 'completed',
          passedCases: passed,
          failedCases: outcomes.length - passed,
          firstTokenP50Ms: firsts.length ? Math.round(percentile(firsts, 50)) : null,
          firstTokenP95Ms: firsts.length ? Math.round(percentile(firsts, 95)) : null,
          totalP50Ms: totals.length ? Math.round(percentile(totals, 50)) : null,
          totalP95Ms: totals.length ? Math.round(percentile(totals, 95)) : null,
          inputTokens: tokenSum((o) => o.inputTokens),
          outputTokens: tokenSum((o) => o.outputTokens),
          finishedAt: now(),
        })
        .where(eq(evalRuns.id, run.id));
    })().catch(async (err: unknown) => {
      // Questions are ours (the golden set), but keep the log lean anyway.
      console.error(`[eval] run ${run.id} failed: ${(err as Error)?.name ?? 'Error'}`);
      await db
        .update(evalRuns)
        .set({
          status: 'failed',
          error: String((err as Error)?.message ?? err).slice(0, 500),
          finishedAt: now(),
        })
        .where(eq(evalRuns.id, run.id))
        .catch?.(() => {});
    });
  }

  return {
    async listCases(): Promise<EvalCase[]> {
      return db.select().from(evalCases).orderBy(asc(evalCases.createdAt));
    },

    async createCase(input: EvalCaseInput): Promise<EvalCase> {
      const [row] = await db.insert(evalCases).values(input).returning();
      return row!;
    },

    async updateCase(id: string, patch: EvalCasePatch): Promise<EvalCase | null> {
      const [row] = await db
        .update(evalCases)
        .set({ ...patch, updatedAt: now() })
        .where(eq(evalCases.id, id))
        .returning();
      return row ?? null;
    },

    async deleteCase(id: string): Promise<boolean> {
      const deleted = await db
        .delete(evalCases)
        .where(eq(evalCases.id, id))
        .returning({ id: evalCases.id });
      return deleted.length > 0;
    },

    /**
     * Start a run and return its row immediately; execution continues in the
     * background and results land row by row.
     */
    async startRun(input: {
      mode: EvalRunMode;
      overrides: Record<string, unknown>;
      triggeredBy: string;
      triggeredByEmail?: string;
    }): Promise<EvalRun> {
      await sweepStaleRuns();

      const resolved = await deps.getConfig();
      const definedOverrides = Object.fromEntries(
        Object.entries(input.overrides).filter(([, v]) => v !== undefined),
      );
      // showCitations pinned last: citation honesty is half of what the eval
      // measures, and a config with chips off would blank every citation check.
      const effective = {
        ...resolved,
        ...definedOverrides,
        showCitations: true,
      } as ResolvedBrainConfig;

      const cases = await db
        .select()
        .from(evalCases)
        .where(eq(evalCases.enabled, true))
        .orderBy(asc(evalCases.createdAt))
        .limit(MAX_ENABLED_CASES);
      if (cases.length === 0) throw new NoEvalCasesError();

      let run: EvalRun;
      try {
        const [inserted] = await db
          .insert(evalRuns)
          .values({
            mode: input.mode,
            configSnapshot: effective as unknown as Record<string, unknown>,
            overridesApplied: definedOverrides,
            model: effective.model,
            toolsEnabled: input.mode === 'full' && effective.toolsEnabled,
            triggeredBy: input.triggeredBy,
            triggeredByEmail: input.triggeredByEmail,
            totalCases: cases.length,
          })
          .returning();
        run = inserted!;
      } catch (err) {
        if (isUniqueViolation(err)) throw new ActiveEvalRunError();
        throw err;
      }

      executeRun(run, effective, cases);
      return run;
    },

    async listRuns(query: {
      page: number;
      limit: number;
    }): Promise<{ items: EvalRun[]; total: number }> {
      await sweepStaleRuns();
      const [items, [totalRow]] = await Promise.all([
        db
          .select()
          .from(evalRuns)
          .orderBy(desc(evalRuns.startedAt))
          .limit(query.limit)
          .offset((query.page - 1) * query.limit),
        db.select({ value: count() }).from(evalRuns),
      ]);
      return { items, total: totalRow?.value ?? 0 };
    },

    async getRun(
      id: string,
    ): Promise<{ run: EvalRun; results: EvalResult[]; previousRunId: string | null } | null> {
      await sweepStaleRuns();
      const [run] = await db.select().from(evalRuns).where(eq(evalRuns.id, id)).limit(1);
      if (!run) return null;

      const [results, [previous]] = await Promise.all([
        db
          .select()
          .from(evalResults)
          .where(eq(evalResults.runId, id))
          .orderBy(asc(evalResults.createdAt)),
        db
          .select({ id: evalRuns.id })
          .from(evalRuns)
          .where(
            and(
              eq(evalRuns.mode, run.mode),
              eq(evalRuns.status, 'completed'),
              lt(evalRuns.startedAt, run.startedAt),
            ),
          )
          .orderBy(desc(evalRuns.startedAt))
          .limit(1),
      ]);

      return { run, results, previousRunId: previous?.id ?? null };
    },
  };
}

export type EvalService = ReturnType<typeof createEvalService>;
