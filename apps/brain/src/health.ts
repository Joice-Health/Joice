import { getDatabase, sql } from '@joice/db';
import { env } from './env';

/**
 * How long the DB probe may take before we call the pool dead. Must stay well
 * under the ALB's health-check timeout (5s) so we answer with a considered
 * "unhealthy" rather than letting the check time out — the difference matters
 * when reading why a deployment rolled back.
 */
const DB_PROBE_TIMEOUT_MS = 2_000;

export interface HealthReport {
  ok: boolean;
  /** Not reachable means this task cannot serve a single useful request. */
  db: 'up' | 'down';
  /** Which build is answering — the first thing you want during an incident. */
  sha: string;
  uptimeSeconds: number;
}

const startedAt = Date.now();

/**
 * A real health check. The previous static `{ok: true}` answered happily from a
 * task whose connection pool was dead, which meant the ECS circuit breaker
 * could never catch a broken release: every task passed its check and the bad
 * deployment went fully live.
 */
export async function checkHealth(): Promise<HealthReport> {
  let db: 'up' | 'down' = 'down';
  try {
    const probe = getDatabase().execute(sql`select 1`);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('db probe timed out')), DB_PROBE_TIMEOUT_MS),
    );
    await Promise.race([probe, timeout]);
    db = 'up';
  } catch (error) {
    // Logged, not swallowed — this is the line that explains a rollback.
    console.error('health: database probe failed:', (error as Error).message);
  }

  return {
    ok: db === 'up',
    db,
    sha: env.BUILD_SHA,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
  };
}
