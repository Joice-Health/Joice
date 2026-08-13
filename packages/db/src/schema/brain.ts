/**
 * Brain-owned tables. @joice/brain reads and writes ONLY what is in this file;
 * nothing else may touch it, and it may not reach into the others. One database,
 * one migration stream — the split is about ownership, not deployment.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * RAG knowledge base: heading-level chunks of the doctor's (PHI-reviewed)
 * reference notes, embedded with Bedrock Titan v2 (1024 dims). Derived data —
 * safe to truncate and rebuild by re-running the joice-ingest task. The HNSW
 * index and `CREATE EXTENSION vector` live in a hand-edited migration
 * (drizzle-kit generates neither).
 */
export const noteChunks = pgTable(
  'note_chunks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** S3 key of the source file (markdown or PDF). */
    sourcePath: text('source_path').notNull(),

    /**
     * What kind of knowledge this is: clinical_note | product_sheet | faq |
     * protocol | policy. One corpus, one HNSW index — retrieval filters by
     * type when a question calls for it (`WHERE source_type = ANY(...)`).
     * Canonical list: packages/brain/src/knowledge/sources.ts.
     */
    sourceType: text('source_type').notNull().default('clinical_note'),

    /** Document title (frontmatter, first heading, or filename). */
    title: text('title'),

    /** sha256 of the whole source file — unchanged hash lets ingestion skip the file. */
    sourceHash: text('source_hash').notNull(),

    /** Order of the chunk within its file. */
    chunkIndex: integer('chunk_index').notNull(),

    /** Heading breadcrumb, e.g. `BPC-157 > Dosing > Oral`. Null for preamble text. */
    headingPath: text('heading_path'),

    content: text('content').notNull(),

    /** Rough size (~chars/4) used to budget how many chunks fit in a prompt. */
    tokenCount: integer('token_count'),

    embedding: vector('embedding', { dimensions: 1024 }).notNull(),

    /** Obsidian frontmatter (tags etc.) captured at ingest time. */
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('note_chunks_source_path_chunk_index_unique').on(table.sourcePath, table.chunkIndex),
    index('note_chunks_source_path_idx').on(table.sourcePath),
    // Filtered retrieval (per-source-type searches) — pgvector runs the HNSW
    // scan and applies this as a post-filter; a b-tree keeps the non-vector
    // lookups (inventory counts, per-type deletes) cheap.
    index('note_chunks_source_type_idx').on(table.sourceType),
    // Retrieval's whole performance story. Declared here to match migration
    // 0003, which created it in raw SQL — undeclared, the next `db:generate`
    // would have emitted a DROP and silently returned every question to a
    // full scan of the corpus. Only an `ORDER BY embedding <=> $1` can use it.
    index('note_chunks_embedding_hnsw_idx')
      .using('hnsw', table.embedding.op('vector_cosine_ops'))
      .with({ m: 16, ef_construction: 64 }),
  ],
);

export type NoteChunk = typeof noteChunks.$inferSelect;
export type NewNoteChunk = typeof noteChunks.$inferInsert;

/**
 * The corpus inventory: one row per ingested source document. `note_chunks`
 * is the searchable derived data; this is what lets a human (or an admin
 * page) answer "what does the brain know, since when, and from where"
 * without SQL over chunk rows. Written only by the ingest task, in the same
 * transaction as the chunks it describes.
 */
export const knowledgeDocuments = pgTable(
  'knowledge_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** S3 key (or relative path in dev) — the join key to note_chunks.source_path. */
    sourcePath: text('source_path').notNull(),

    /** clinical_note | product_sheet | faq | protocol | policy. */
    sourceType: text('source_type').notNull().default('clinical_note'),

    /** Frontmatter title, first heading, or filename. */
    title: text('title'),

    /** sha256 of the source file at ingest time — matches the chunks' hash. */
    sourceHash: text('source_hash').notNull(),

    chunkCount: integer('chunk_count').notNull().default(0),

    /** Frontmatter + anything the ingest wants to record (e.g. PHI review notes). */
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('knowledge_documents_source_path_unique').on(table.sourcePath),
    index('knowledge_documents_source_type_idx').on(table.sourceType),
  ],
);

export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
export type NewKnowledgeDocument = typeof knowledgeDocuments.$inferInsert;

/**
 * A chat thread.
 *
 * `member_id` is nullable and `anonymous_session_id` carries the thread until
 * sign-in exists: history works today for someone who has never logged in, and
 * the day member accounts ship, claiming a conversation is an UPDATE rather
 * than a migration. Exactly one of the two is always set.
 *
 * ⚠️ Persisting member questions crosses the Phase-0 "marketing data only"
 * line — a question about a symptom is health information tied to a person.
 * Retention policy and the Before-PHI checklist must be settled before real
 * members use this. See docs/rag/07-compliance.md.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Set once the member signs in; null for anonymous threads. */
    memberId: uuid('member_id'),

    /**
     * Opaque per-browser-session id, so an anonymous thread hangs together.
     * Never derived from an IP or anything else identifying.
     */
    anonymousSessionId: text('anonymous_session_id'),

    /** First question, trimmed — enough to list threads without loading them. */
    title: text('title'),

    /** Open-ended room for things that shouldn't each become a column. */
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // "This member's history", newest first — the query the UI will make.
    index('conversations_member_idx').on(table.memberId, table.createdAt.desc()),
    index('conversations_anon_idx').on(table.anonymousSessionId, table.createdAt.desc()),
  ],
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

/**
 * One turn. Append-only: a message is never edited, so the thread is an honest
 * record of what was actually said and answered.
 *
 * This is also the evaluation data — the only way to tell whether answers are
 * getting better is to have the old ones, with the citations they were based on.
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),

    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),

    /** Which chunks the answer cited, as returned to the member. Null on user turns. */
    citations: jsonb('citations').$type<unknown[]>(),

    /** Which model produced this, so a quality change can be traced to a swap. */
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Replaying a thread in order — the only read path that matters.
    index('messages_conversation_idx').on(table.conversationId, table.createdAt),
  ],
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

/**
 * A pre-onboarding lead: what the companion learned about a visitor before they
 * became a member. Name, email, and the care area they're here for, captured
 * conversationally and handed to the onboarding flow.
 *
 * Same dual-key pattern as `conversations`: keyed on `anonymous_session_id`
 * today, so a lead captured before sign-up attaches to the member the day
 * accounts ship (see `claim`). Exactly one of the two keys is always set.
 *
 * NOT health information. This is name + email + a goal slug — the same
 * marketing-grade class as `waitlist_entries`, stored unconditionally and
 * deliberately kept separate from `messages` (the health questions), which
 * remain behind the persistence flag. DOB is intentionally absent: it belongs
 * at onboarding, behind consent.
 */
export const brainProfiles = pgTable(
  'brain_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Set once the member signs in; null while anonymous. */
    memberId: uuid('member_id'),

    /** Opaque per-browser-session id — the key while anonymous. */
    anonymousSessionId: text('anonymous_session_id'),

    name: text('name'),
    email: text('email'),

    /** A care-area slug from the canonical list (weight-metabolic, etc.). */
    goal: text('goal'),
    /** Free text when the goal is "not sure" or needs elaboration. */
    goalNote: text('goal_note'),

    /** Fields the visitor declined, so the companion never re-asks them. */
    skipped: jsonb('skipped').$type<string[]>().notNull().default([]),

    /** Set when the visitor chooses to start their journey — the lead signal. */
    readyForOnboarding: boolean('ready_for_onboarding').notNull().default(false),

    /** capturing → exploring → ready → converted. */
    status: text('status').notNull().default('capturing'),

    /**
     * When the lead was last synced to the marketing platform (Klaviyo).
     * NULL = never synced, which keeps unsynced rows findable — the same
     * bookkeeping discipline as `waitlist_entries.marketing_synced_at`.
     * The two funnels stay separate; Klaviyo deduping by email is the only
     * place they ever meet.
     */
    marketingSyncedAt: timestamp('marketing_synced_at', { withTimezone: true }),

    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One profile per anonymous session — findOrCreate upserts against this.
    uniqueIndex('brain_profiles_anon_session_unique').on(table.anonymousSessionId),
    index('brain_profiles_member_idx').on(table.memberId),
    // The admin leads list: newest ready/updated leads first.
    index('brain_profiles_updated_idx').on(table.updatedAt.desc()),
  ],
);

export type BrainProfile = typeof brainProfiles.$inferSelect;
export type NewBrainProfile = typeof brainProfiles.$inferInsert;
