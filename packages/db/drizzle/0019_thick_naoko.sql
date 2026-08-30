CREATE TABLE "lab_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"s3_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "lab_uploads_member_idx" ON "lab_uploads" USING btree ("member_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "lab_uploads_key_unique" ON "lab_uploads" USING btree ("s3_key");