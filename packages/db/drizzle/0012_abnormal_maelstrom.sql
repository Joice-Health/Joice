CREATE TABLE "onboarding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" text NOT NULL,
	"session_id" uuid NOT NULL,
	"flow_version_id" uuid NOT NULL,
	"section_key" text,
	"question_key" text,
	"outcome" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_flow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"definition" jsonb NOT NULL,
	"logic_hash" text,
	"notes" text,
	"validation_report" jsonb,
	"created_by" text DEFAULT 'system' NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text,
	"published_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_version_id" uuid NOT NULL,
	"anonymous_session_id" uuid NOT NULL,
	"member_id" uuid,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"skipped" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cursor_question_key" text,
	"carry_over" jsonb,
	"gate_outcome" jsonb,
	"ip_hash" text,
	"completed_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trait" text NOT NULL,
	"value" jsonb NOT NULL,
	"source" text NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"onboarding_session_id" uuid,
	"member_id" uuid,
	"flow_version_id" uuid,
	"question_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid,
	"anonymous_session_id" uuid,
	"traits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"segment" text,
	"projector_version" integer DEFAULT 1 NOT NULL,
	"flow_version_id" uuid,
	"projected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_area_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"state_code" text NOT NULL,
	"onboarding_session_id" uuid,
	"ip_hash" text,
	"marketing_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_code" text NOT NULL,
	"status" text DEFAULT 'notify' NOT NULL,
	"note" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "onboarding_events_version_event_idx" ON "onboarding_events" USING btree ("flow_version_id","event","occurred_at");--> statement-breakpoint
CREATE INDEX "onboarding_events_session_idx" ON "onboarding_events" USING btree ("session_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_flow_versions_flow_version_unique" ON "onboarding_flow_versions" USING btree ("flow_id","version");--> statement-breakpoint
CREATE INDEX "onboarding_flow_versions_flow_status_idx" ON "onboarding_flow_versions" USING btree ("flow_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_flows_key_unique" ON "onboarding_flows" USING btree ("key");--> statement-breakpoint
CREATE INDEX "onboarding_sessions_anon_idx" ON "onboarding_sessions" USING btree ("anonymous_session_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "onboarding_sessions_member_idx" ON "onboarding_sessions" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "onboarding_sessions_status_activity_idx" ON "onboarding_sessions" USING btree ("status","last_activity_at");--> statement-breakpoint
CREATE INDEX "profile_observations_member_trait_idx" ON "profile_observations" USING btree ("member_id","trait","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "profile_observations_session_idx" ON "profile_observations" USING btree ("onboarding_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_member_unique" ON "profiles" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_anon_unique" ON "profiles" USING btree ("anonymous_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_area_requests_email_state_unique" ON "service_area_requests" USING btree ("email","state_code");--> statement-breakpoint
CREATE INDEX "service_area_requests_state_idx" ON "service_area_requests" USING btree ("state_code","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "service_areas_state_code_unique" ON "service_areas" USING btree ("state_code");