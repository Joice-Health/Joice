import { describe, expect, test } from 'bun:test';
import type { Database } from '@joice/db';
import type { AuditService } from './admin/audit-service';
import { createBrainConfigService } from './brain-config';

/**
 * Chainable stub for the brain-config queries: select().from().where().limit()
 * resolves to `rows`; insert/delete resolve trivially; transaction passes the
 * same stub through.
 */
function stubDb(opts: { rows: () => unknown[]; onSelect?: () => void }) {
  const db = {
    select: () => {
      opts.onSelect?.();
      return {
        from: () => ({ where: () => ({ limit: () => Promise.resolve(opts.rows()) }) }),
      };
    },
    insert: () => ({
      values: () => ({ onConflictDoUpdate: () => Promise.resolve() }),
    }),
    delete: () => ({ where: () => Promise.resolve() }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return db as unknown as Database;
}

const stubAudit = { record: async () => {} } as unknown as AuditService;
const actor = { clerkUserId: 'user_admin', email: 'admin@joice.test' };
const envDefaults = { model: 'env-model', pollyVoiceId: 'EnvVoice' };

describe('brain config', () => {
  test('resolves defaults + env fallbacks when nothing is stored', async () => {
    const brain = createBrainConfigService(stubDb({ rows: () => [] }), stubAudit, { envDefaults });
    const config = await brain.get();
    expect(config.model).toBe('env-model');
    expect(config.pollyVoiceId).toBe('EnvVoice');
    expect(config.topK).toBe(8);
    expect(config.attributionStyle).toBe('cite-notes');
  });

  test('stored overrides win over defaults and env', async () => {
    const brain = createBrainConfigService(
      stubDb({ rows: () => [{ value: { model: 'stored-model', topK: 3, attributionStyle: 'natural' } }] }),
      stubAudit,
      { envDefaults },
    );
    const config = await brain.get();
    expect(config.model).toBe('stored-model');
    expect(config.topK).toBe(3);
    expect(config.attributionStyle).toBe('natural');
    expect(config.pollyVoiceId).toBe('EnvVoice'); // untouched field falls through
  });

  test('an invalid stored row falls back to defaults instead of breaking', async () => {
    const brain = createBrainConfigService(
      stubDb({ rows: () => [{ value: { topK: 'lots', similarityFloor: 9 } }] }),
      stubAudit,
      { envDefaults },
    );
    const config = await brain.get();
    expect(config.topK).toBe(8);
    expect(config.similarityFloor).toBe(0.4);
  });

  test('reads are cached within the TTL and refetched after expiry', async () => {
    let selects = 0;
    let clock = 0;
    const brain = createBrainConfigService(
      stubDb({ rows: () => [], onSelect: () => selects++ }),
      stubAudit,
      { envDefaults, cacheTtlMs: 30_000, now: () => clock },
    );

    await brain.get();
    await brain.get();
    expect(selects).toBe(1);

    clock = 30_001;
    await brain.get();
    expect(selects).toBe(2);
  });

  test('update merges the patch, invalidates the cache, and returns resolved config', async () => {
    let stored: unknown[] = [];
    let selects = 0;
    const brain = createBrainConfigService(
      stubDb({ rows: () => stored, onSelect: () => selects++ }),
      stubAudit,
      { envDefaults, cacheTtlMs: 60_000 },
    );

    await brain.get(); // primes the cache
    const baseline = selects;

    const resolved = await brain.update({ personaName: 'Dot' }, actor);
    expect(resolved.personaName).toBe('Dot');
    expect(resolved.model).toBe('env-model');

    stored = [{ value: { personaName: 'Dot' } }];
    await brain.get(); // cache was invalidated → re-reads
    expect(selects).toBeGreaterThan(baseline);
  });

  test('update rejects an invalid patch', async () => {
    const brain = createBrainConfigService(stubDb({ rows: () => [] }), stubAudit, { envDefaults });
    await expect(brain.update({ topK: 999 } as never, actor)).rejects.toThrow();
  });
});
