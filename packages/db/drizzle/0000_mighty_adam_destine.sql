CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"referral_code" text NOT NULL,
	"referred_by_code" text,
	"referred_by_id" uuid,
	"referral_count" integer DEFAULT 0 NOT NULL,
	"sequence" bigserial NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_referred_by_id_waitlist_entries_id_fk" FOREIGN KEY ("referred_by_id") REFERENCES "public"."waitlist_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entries_email_unique" ON "waitlist_entries" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entries_referral_code_unique" ON "waitlist_entries" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "waitlist_entries_referred_by_id_idx" ON "waitlist_entries" USING btree ("referred_by_id");