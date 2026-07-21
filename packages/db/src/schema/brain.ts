/**
 * Brain-owned tables. @joice/brain reads and writes ONLY what is in this file;
 * nothing else may touch it, and it may not reach into the others. One database,
 * one migration stream — the split is about ownership, not deployment.
 */
import {
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
