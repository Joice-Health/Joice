import {
  bigserial,
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
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * The single Phase 0 table: people on the Joice waitlist.
 *
 * Referral attribution is tracked (referred_by_*), but reward logic is deliberately
 * out of scope for Phase 0 — we only surface `position` (derived from `sequence`) and
 * `referral_count`. See the design plan for the full rationale.
 */
export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Stored lowercased + trimmed; the natural unique key for idempotent signups. */
    email: text('email').notNull(),

    /** Collected at signup (V1 brief). Nullable for rows created before the fields existed. */
    firstName: text('first_name'),
    lastName: text('last_name'),

    /** Short, URL-safe slug shared in referral links (e.g. ?ref=ab12cd34). */
    referralCode: text('referral_code').notNull(),

    /** The raw ?ref= value captured at signup (kept even if it failed to resolve). */
    referredByCode: text('referred_by_code'),

    /** Resolved referrer, if the ?ref= code matched an existing entry. */
    referredById: uuid('referred_by_id').references((): AnyPgColumn => waitlistEntries.id, {
      onDelete: 'set null',
    }),

    /** Denormalized count of people who signed up with this entry's referral code. */
    referralCount: integer('referral_count').notNull().default(0),

    /** Monotonic signup order; position in line = rank by this column. */
    sequence: bigserial('sequence', { mode: 'number' }).notNull(),

    /** Lifecycle status — future-proofing for Phase 1 (invited/converted). */
    status: text('status').notNull().default('pending'),

    /** Arbitrary capture context (utm params, source, etc.). */
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    /** Hashed IP for light abuse mitigation; never store raw IPs. */
    ipHash: text('ip_hash'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('waitlist_entries_email_unique').on(table.email),
    uniqueIndex('waitlist_entries_referral_code_unique').on(table.referralCode),
    index('waitlist_entries_referred_by_id_idx').on(table.referredById),
  ],
);

export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type NewWaitlistEntry = typeof waitlistEntries.$inferInsert;

/**
 * Member users. Authentication lives in Clerk; this table is our own record of
 * each member, keyed by their Clerk user id. Empty until member sign-ups launch.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Clerk's user id (`user_...`) — the authoritative identity key. */
    clerkUserId: text('clerk_user_id').notNull(),

    /** Mirrored from Clerk; kept locally for querying/joins without API calls. */
    email: text('email').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),

    /** Lifecycle: active | suspended | deleted. */
    status: text('status').notNull().default('active'),

    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_clerk_user_id_unique').on(table.clerkUserId),
    uniqueIndex('users_email_unique').on(table.email),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/**
 * DB-backed feature flags, managed from the admin UI and evaluated server-side
 * (with a short in-memory cache) so toggles don't need a deploy.
 */
export const featureFlags = pgTable(
  'feature_flags',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Stable slug referenced from code, e.g. `member_signups`. Immutable after create. */
    key: text('key').notNull(),
    description: text('description'),
    enabled: boolean('enabled').notNull().default(false),

    /** Reserved for future targeting (percentage rollout, audiences). */
    rollout: jsonb('rollout').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('feature_flags_key_unique').on(table.key)],
);

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type NewFeatureFlag = typeof featureFlags.$inferInsert;

/** Runtime key/value settings editable from the admin UI (values are arbitrary JSON). */
export const appSettings = pgTable(
  'app_settings',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    key: text('key').notNull(),
    value: jsonb('value').$type<unknown>().notNull(),
    description: text('description'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('app_settings_key_unique').on(table.key)],
);

export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;

/**
 * Append-only trail of every admin mutation (who/what/before/after). Rows are
 * written in the same transaction as the change they describe and never updated.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    actorClerkUserId: text('actor_clerk_user_id').notNull(),
    /** Denormalized at write time so the trail survives account changes in Clerk. */
    actorEmail: text('actor_email'),

    /** Dotted verb, e.g. `flag.toggle`, `waitlist.update_status`. */
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),

    before: jsonb('before').$type<unknown>(),
    after: jsonb('after').$type<unknown>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_created_at_idx').on(table.createdAt),
    index('audit_logs_entity_idx').on(table.entityType, table.entityId),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

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

    /** S3 key of the source markdown file. */
    sourcePath: text('source_path').notNull(),

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
