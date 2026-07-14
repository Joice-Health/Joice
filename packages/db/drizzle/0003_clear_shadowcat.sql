CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "note_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_path" text NOT NULL,
	"source_hash" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"heading_path" text,
	"content" text NOT NULL,
	"token_count" integer,
	"embedding" vector(1024) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "note_chunks_source_path_chunk_index_unique" ON "note_chunks" USING btree ("source_path","chunk_index");--> statement-breakpoint
CREATE INDEX "note_chunks_source_path_idx" ON "note_chunks" USING btree ("source_path");--> statement-breakpoint
CREATE INDEX "note_chunks_embedding_hnsw_idx" ON "note_chunks" USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64);