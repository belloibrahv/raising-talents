CREATE SCHEMA "safety";
--> statement-breakpoint
CREATE TYPE "safety"."enforcement_action" AS ENUM('suspend', 'ban', 'reinstate');--> statement-breakpoint
CREATE TYPE "safety"."report_category" AS ENUM('fake_or_impersonation', 'inappropriate_content', 'scam_or_harassment', 'underage', 'other');--> statement-breakpoint
CREATE TYPE "safety"."report_status" AS ENUM('open', 'dismissed', 'actioned');--> statement-breakpoint
CREATE TABLE "safety"."enforcement_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"action" "safety"."enforcement_action" NOT NULL,
	"reason" "safety"."report_category",
	"actor_id" uuid,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety"."reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reporter_id" uuid,
	"subject_id" uuid NOT NULL,
	"category" "safety"."report_category" NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" "safety"."report_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid
);
--> statement-breakpoint
ALTER TABLE "safety"."enforcement_actions" ADD CONSTRAINT "enforcement_actions_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety"."enforcement_actions" ADD CONSTRAINT "enforcement_actions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "accounts"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety"."reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "accounts"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety"."reports" ADD CONSTRAINT "reports_subject_id_users_id_fk" FOREIGN KEY ("subject_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety"."reports" ADD CONSTRAINT "reports_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "accounts"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enforcement_actions_account_idx" ON "safety"."enforcement_actions" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_open_idx" ON "safety"."reports" USING btree ("subject_id","created_at") WHERE status = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "reports_one_open_per_reporter" ON "safety"."reports" USING btree ("reporter_id","subject_id") WHERE status = 'open';