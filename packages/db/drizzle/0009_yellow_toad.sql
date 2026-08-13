CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_path" text NOT NULL,
	"source_type" text DEFAULT 'clinical_note' NOT NULL,
	"title" text,
	"source_hash" text NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note_chunks" ADD COLUMN "source_type" text DEFAULT 'clinical_note' NOT NULL;--> statement-breakpoint
ALTER TABLE "note_chunks" ADD COLUMN "title" text;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_documents_source_path_unique" ON "knowledge_documents" USING btree ("source_path");--> statement-breakpoint
CREATE INDEX "knowledge_documents_source_type_idx" ON "knowledge_documents" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "note_chunks_source_type_idx" ON "note_chunks" USING btree ("source_type");