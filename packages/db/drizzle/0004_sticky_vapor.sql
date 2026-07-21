-- Reconciles the schema snapshot with reality: migration 0003 created this
-- index in hand-written SQL, so Drizzle never recorded it and the next
-- `db:generate` would have emitted a DROP. IF NOT EXISTS because every
-- existing database already has it — this migration is a no-op there and a
-- real create only on a database built from scratch.
CREATE INDEX IF NOT EXISTS "note_chunks_embedding_hnsw_idx" ON "note_chunks" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);
