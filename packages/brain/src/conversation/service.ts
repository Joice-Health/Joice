import { and, asc, conversations, desc, eq, isNull, messages, type Database } from '@joice/db';
import type { Citation } from './schemas';
import type { Requester } from '../ports';

/**
 * Persisting chat threads.
 *
 * Until now the conversation lived only in the browser: the client resent the
 * visible history each turn, and closing the tab lost it. That was the right
 * call while there were no accounts, but it caps what the brain can be — there
 * is no history to recall, no profile to build on, and no record of what the
 * assistant actually told someone.
 *
 * It's also the evaluation data. The only way to know whether answers are
 * improving is to still have the old ones, with the citations they rested on.
 *
 * ⚠️ Compliance gate: a stored question about a symptom is health information
 * tied to a person. This crosses the Phase-0 "marketing data only" line. The
 * retention policy and the Before-PHI checklist have to be settled before real
 * members use this — see docs/rag/07-compliance.md. Writing is therefore
 * opt-in per deployment (`BRAIN_PERSIST_CONVERSATIONS`), off by default.
 */

/** Enough of a thread to replay it. */
export interface StoredConversation {
  id: string;
  title: string | null;
  createdAt: Date;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    citations: Citation[];
    createdAt: Date;
    /** The visitor cut this answer off mid-stream — it is partial. */
    aborted?: boolean;
  }>;
}

/** What an answer cost and where it came from — recorded per assistant turn. */
export interface AnswerMetadata {
  citations: Citation[];
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** The visitor cut the stream off — the answer text is partial. */
  aborted?: boolean;
}

/** Longest title we keep; the rest of the first question is in the message row. */
const TITLE_MAX = 120;

/**
 * A thread left alone this long is finished; the next question starts a new
 * one. Without this, findOrCreate reused the session's first-ever thread
 * forever — one endless row titled by a question from weeks ago, and no way
 * to ever see more than one entry in the history list.
 */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function createConversationService(db: Database) {
  return {
    /**
     * Find the requester's open thread or start one. Keyed on member id when
     * signed in, otherwise the anonymous session id — which is what lets a
     * thread survive today and be claimed by a member later. A thread idle
     * for more than a day is closed: the next question opens a fresh one.
     */
    async findOrCreate(requester: Requester, firstQuestion: string): Promise<string> {
      const scope = requester.memberId
        ? eq(conversations.memberId, requester.memberId)
        : eq(conversations.anonymousSessionId, requester.sessionId);

      const [existing] = await db
        .select({
          id: conversations.id,
          updatedAt: conversations.updatedAt,
          title: conversations.title,
        })
        .from(conversations)
        .where(scope)
        .orderBy(desc(conversations.createdAt))
        .limit(1);
      if (existing && Date.now() - existing.updatedAt.getTime() < STALE_AFTER_MS) {
        // A thread opened empty by startNew() gets its title from the first
        // question actually asked in it.
        if (!existing.title) {
          await db
            .update(conversations)
            .set({ title: firstQuestion.trim().slice(0, TITLE_MAX) || null })
            .where(eq(conversations.id, existing.id));
        }
        return existing.id;
      }

      const [created] = await db
        .insert(conversations)
        .values({
          memberId: requester.memberId,
          // Kept even when signed in: it's how a thread started before sign-in
          // is matched to the member who started it.
          anonymousSessionId: requester.sessionId,
          title: firstQuestion.trim().slice(0, TITLE_MAX) || null,
        })
        .returning({ id: conversations.id });
      return created!.id;
    },

    /**
     * Deliberately close the current thread by opening an empty one — the
     * "start a new conversation" affordance. The empty thread is now the most
     * recent, so findOrCreate appends there (titled by the next question) and
     * a reload no longer resurrects the conversation the visitor discarded.
     */
    async startNew(requester: Requester): Promise<string> {
      const [created] = await db
        .insert(conversations)
        .values({
          memberId: requester.memberId,
          anonymousSessionId: requester.sessionId,
          title: null,
        })
        .returning({ id: conversations.id });
      return created!.id;
    },

    /**
     * Append a completed exchange. One transaction, because a question stored
     * without its answer would come back as history that breaks Bedrock's
     * alternation rule — the exact failure mode buildChatHistory exists to
     * prevent, reintroduced through the database.
     */
    async recordExchange(
      conversationId: string,
      question: string,
      answer: string,
      meta: AnswerMetadata,
    ): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.insert(messages).values([
          { conversationId, role: 'user', content: question },
          {
            conversationId,
            role: 'assistant',
            content: answer,
            citations: meta.citations,
            model: meta.model,
            inputTokens: meta.inputTokens,
            outputTokens: meta.outputTokens,
            // Partial (cut-off) answers are marked, never silently mixed in
            // with answers someone actually read to the end.
            ...(meta.aborted ? { metadata: { aborted: true } } : {}),
          },
        ]);
        await tx
          .update(conversations)
          .set({ updatedAt: new Date() })
          .where(eq(conversations.id, conversationId));
      });
    },

    /** Replay a thread in order. Scoped to the requester so ids aren't guessable. */
    async get(conversationId: string, requester: Requester): Promise<StoredConversation | null> {
      const scope = requester.memberId
        ? eq(conversations.memberId, requester.memberId)
        : eq(conversations.anonymousSessionId, requester.sessionId);

      const [conversation] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, conversationId), scope))
        .limit(1);
      if (!conversation) return null;

      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        // Both rows of an exchange share one createdAt (one INSERT, one
        // transaction time), so a secondary key keeps the question before its
        // answer: 'user' > 'assistant' lexically, hence desc.
        .orderBy(asc(messages.createdAt), desc(messages.role));

      return {
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.createdAt,
        messages: rows.map((row) => ({
          role: row.role,
          content: row.content,
          citations: (row.citations ?? []) as Citation[],
          createdAt: row.createdAt,
          ...(row.metadata?.aborted === true ? { aborted: true } : {}),
        })),
      };
    },

    /**
     * The requester's threads, newest first — for a history list. Deliberately
     * doesn't load messages: the list view only needs titles.
     */
    async list(requester: Requester, limit = 20) {
      const scope = requester.memberId
        ? eq(conversations.memberId, requester.memberId)
        : eq(conversations.anonymousSessionId, requester.sessionId);

      return db
        .select({
          id: conversations.id,
          title: conversations.title,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
        })
        .from(conversations)
        .where(scope)
        .orderBy(desc(conversations.updatedAt))
        .limit(limit);
    },

    /**
     * Attach anonymous threads to a member on sign-up. The whole reason
     * `anonymous_session_id` is kept alongside `member_id`: someone who chatted
     * before creating an account keeps their history.
     */
    async claim(sessionId: string, memberId: string): Promise<number> {
      const claimed = await db
        .update(conversations)
        .set({ memberId })
        .where(
          and(
            eq(conversations.anonymousSessionId, sessionId),
            // Only unclaimed threads: a session id is a bearer token, and
            // without this, replaying someone else's would reassign their
            // history.
            isNull(conversations.memberId),
          ),
        )
        .returning({ id: conversations.id });
      return claimed.length;
    },
  };
}

export type ConversationService = ReturnType<typeof createConversationService>;
