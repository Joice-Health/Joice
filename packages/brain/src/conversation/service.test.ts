import { describe, expect, test } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { Database } from '@joice/db';
import { createConversationService } from './service';
import type { Requester } from '../ports';

/**
 * These assert the *shape* of what the service does — which table it writes,
 * whether a write is transactional, whether a read is scoped. The queries
 * themselves are exercised against real Postgres by the end-to-end check in the
 * runbook; what a unit test can protect is the reasoning, and two pieces of
 * reasoning here are load-bearing:
 *
 *   - a question and its answer must be written in ONE transaction, or history
 *     comes back with two adjacent user turns and Bedrock rejects it;
 *   - a read must be scoped to the requester, or a conversation id alone is
 *     enough to read someone else's history.
 */

interface Recorded {
  inserts: Array<{ table: string; values: unknown; inTransaction: boolean }>;
  wheres: unknown[];
  transactions: number;
}

function stubDb(rows: unknown[] = []) {
  const recorded: Recorded = { inserts: [], wheres: [], transactions: 0 };
  let inTransaction = false;

  const chain = () => ({
    from: () => chain(),
    where: (w: unknown) => {
      recorded.wheres.push(w);
      return chain();
    },
    orderBy: () => chain(),
    limit: () => Promise.resolve(rows),
    returning: () => Promise.resolve(rows.length ? rows : [{ id: 'new-conversation' }]),
    set: () => chain(),
    values: (v: unknown) => {
      recorded.inserts.push({ table: 'insert', values: v, inTransaction });
      return { returning: () => Promise.resolve([{ id: 'new-conversation' }]) };
    },
    then: undefined,
  });

  const db = {
    select: () => chain(),
    insert: () => chain(),
    update: () => chain(),
    delete: () => chain(),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      recorded.transactions++;
      inTransaction = true;
      try {
        return await fn(db);
      } finally {
        inTransaction = false;
      }
    },
  };
  return { db: db as unknown as Database, recorded };
}

const anonymous: Requester = { memberId: null, sessionId: 'session-abc' };
const member: Requester = { memberId: 'member-1', sessionId: 'session-abc' };

describe('findOrCreate', () => {
  test('reuses the requester’s most recent thread while it is fresh', async () => {
    const { db } = stubDb([{ id: 'existing-conversation', updatedAt: new Date() }]);
    const service = createConversationService(db);
    expect(await service.findOrCreate(anonymous, 'hello')).toBe('existing-conversation');
  });

  test('a thread idle for more than a day is closed — the next question starts fresh', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const { db, recorded } = stubDb([{ id: 'stale-conversation', updatedAt: twoDaysAgo }]);
    const service = createConversationService(db);

    const id = await service.findOrCreate(anonymous, 'A new topic?');
    expect(id).toBe('new-conversation');
    // The new thread is titled by the new question, not the stale one's.
    const values = recorded.inserts[0]!.values as Record<string, unknown>;
    expect(values.title).toBe('A new topic?');
  });

  test('starts one when there is none, titled from the first question', async () => {
    const { db, recorded } = stubDb([]);
    const service = createConversationService(db);
    const id = await service.findOrCreate(anonymous, '  What is BPC-157?  ');
    expect(id).toBe('new-conversation');

    const values = recorded.inserts[0]!.values as Record<string, unknown>;
    expect(values.title).toBe('What is BPC-157?');
    // Anonymous today: no member, but a session that can be claimed later.
    expect(values.memberId).toBeNull();
    expect(values.anonymousSessionId).toBe('session-abc');
  });

  test('a signed-in member still carries the session id, so pre-login threads can be claimed', async () => {
    const { db, recorded } = stubDb([]);
    const service = createConversationService(db);
    await service.findOrCreate(member, 'hello');
    const values = recorded.inserts[0]!.values as Record<string, unknown>;
    expect(values.memberId).toBe('member-1');
    expect(values.anonymousSessionId).toBe('session-abc');
  });

  test('a very long first question does not become a very long title', async () => {
    const { db, recorded } = stubDb([]);
    const service = createConversationService(db);
    await service.findOrCreate(anonymous, 'x'.repeat(500));
    const values = recorded.inserts[0]!.values as Record<string, unknown>;
    expect((values.title as string).length).toBeLessThanOrEqual(120);
  });
});

describe('recordExchange', () => {
  /**
   * The regression this prevents: writing the question and the answer
   * separately means a crash between them leaves a user turn with no reply.
   * Replayed as history that's two adjacent user turns — the exact shape
   * buildChatHistory exists to make unrepresentable, reintroduced via the DB.
   */
  test('writes the question and its answer in one transaction', async () => {
    const { db, recorded } = stubDb([]);
    const service = createConversationService(db);
    await service.recordExchange('conv-1', 'Question?', 'Answer.', {
      citations: [],
      model: 'test-model',
    });

    expect(recorded.transactions).toBe(1);
    const written = recorded.inserts[0]!;
    expect(written.inTransaction).toBe(true);

    const rows = written.values as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.role).toBe('user');
    expect(rows[1]!.role).toBe('assistant');
  });

  test('keeps the citations and the model that produced the answer', async () => {
    const { db, recorded } = stubDb([]);
    const service = createConversationService(db);
    const citations = [
      { index: 1, sourcePath: 'peptides/bpc-157.md', headingPath: 'Dosing', citedText: '250mcg' },
    ];
    await service.recordExchange('conv-1', 'Q?', 'A.', {
      citations,
      model: 'us.amazon.nova-pro-v1:0',
      inputTokens: 100,
      outputTokens: 50,
    });

    const rows = recorded.inserts[0]!.values as Array<Record<string, unknown>>;
    expect(rows[1]!.citations).toEqual(citations);
    expect(rows[1]!.model).toBe('us.amazon.nova-pro-v1:0');
    expect(rows[1]!.inputTokens).toBe(100);
    // The question carries no citations — only the answer does.
    expect(rows[0]!.citations).toBeUndefined();
  });
});

describe('get', () => {
  test('a thread nobody owns comes back as null, not as someone else’s', async () => {
    const { db } = stubDb([]);
    const service = createConversationService(db);
    expect(await service.get('conv-1', anonymous)).toBeNull();
  });

  /**
   * A conversation id is a UUID in a URL. Without the requester in the WHERE
   * clause, knowing one would be enough to read the thread it belongs to.
   */
  test('scopes the lookup to the requester, not just the id', async () => {
    const { db, recorded } = stubDb([]);
    const service = createConversationService(db);
    await service.get('conv-1', anonymous);

    const rendered = new PgDialect().sqlToQuery(recorded.wheres[0] as SQL);
    // Both conditions, ANDed — never a bare id match.
    expect(rendered.sql).toContain('"conversations"."id"');
    expect(rendered.sql).toContain('"conversations"."anonymous_session_id"');
    expect(rendered.sql).toContain(' and ');
    expect(rendered.params).toContain('session-abc');
  });
});

describe('aborted exchanges', () => {
  test('a cut-off answer is recorded with the aborted marker, never silently mixed in', async () => {
    const { db, recorded } = stubDb([]);
    const service = createConversationService(db);
    await service.recordExchange('conv-1', 'Q?', 'Partial ans', {
      citations: [],
      aborted: true,
    });
    const rows = recorded.inserts[0]!.values as Array<Record<string, unknown>>;
    expect(rows[1]!.metadata).toEqual({ aborted: true });

    await service.recordExchange('conv-1', 'Q?', 'Full answer.', { citations: [] });
    const rows2 = recorded.inserts[1]!.values as Array<Record<string, unknown>>;
    expect(rows2[1]!.metadata).toBeUndefined();
  });
});
