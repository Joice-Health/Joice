CREATE TABLE "brain_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid,
	"anonymous_session_id" text,
	"name" text,
	"email" text,
	"goal" text,
	"goal_note" text,
	"skipped" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ready_for_onboarding" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'capturing' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "brain_profiles_anon_session_unique" ON "brain_profiles" USING btree ("anonymous_session_id");--> statement-breakpoint
CREATE INDEX "brain_profiles_member_idx" ON "brain_profiles" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "brain_profiles_updated_idx" ON "brain_profiles" USING btree ("updated_at" DESC NULLS LAST);