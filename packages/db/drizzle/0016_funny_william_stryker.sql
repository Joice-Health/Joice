CREATE TABLE "eval_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"expect_sources" jsonb,
	"expect_refusal" boolean DEFAULT false NOT NULL,
	"expect_tool" text,
	"must_cite" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"case_id" uuid,
	"question" text NOT NULL,
	"pass" boolean NOT NULL,
	"detail" text NOT NULL,
	"answer" text,
	"citations" jsonb,
	"tools_called" jsonb,
	"first_token_ms" integer,
	"total_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"mode" text NOT NULL,
	"config_snapshot" jsonb NOT NULL,
	"overrides_applied" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model" text NOT NULL,
	"tools_enabled" boolean DEFAULT false NOT NULL,
	"triggered_by" text NOT NULL,
	"triggered_by_email" text,
	"total_cases" integer DEFAULT 0 NOT NULL,
	"passed_cases" integer,
	"failed_cases" integer,
	"first_token_p50_ms" integer,
	"first_token_p95_ms" integer,
	"total_p50_ms" integer,
	"total_p95_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_run_id_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."eval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_case_id_eval_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."eval_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_question_unique" ON "eval_cases" USING btree ("question");--> statement-breakpoint
CREATE INDEX "eval_results_run_idx" ON "eval_results" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "eval_runs_started_idx" ON "eval_runs" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "eval_runs_mode_status_idx" ON "eval_runs" USING btree ("mode","status","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "eval_runs_one_running_unique" ON "eval_runs" USING btree ("status") WHERE "eval_runs"."status" = 'running';