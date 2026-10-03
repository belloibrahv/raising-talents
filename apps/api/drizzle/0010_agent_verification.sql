CREATE TYPE "agent"."verification_decline_category" AS ENUM('agency_not_confirmed', 'details_do_not_match', 'evidence_unreachable', 'other');--> statement-breakpoint
CREATE TYPE "agent"."verification_status" AS ENUM('pending', 'approved', 'declined');--> statement-breakpoint
CREATE TABLE "agent"."verification_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" "agent"."verification_status" NOT NULL,
	"evidence_url" text NOT NULL,
	"registration_number" text,
	"note" text DEFAULT '' NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decline_category" "agent"."verification_decline_category"
);
--> statement-breakpoint
ALTER TABLE "agent"."verification_requests" ADD CONSTRAINT "verification_requests_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent"."verification_requests" ADD CONSTRAINT "verification_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "accounts"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verification_requests_agent_idx" ON "agent"."verification_requests" USING btree ("agent_id","submitted_at");--> statement-breakpoint
CREATE INDEX "verification_requests_pending_idx" ON "agent"."verification_requests" USING btree ("submitted_at","id") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "verification_requests_one_pending" ON "agent"."verification_requests" USING btree ("agent_id") WHERE status = 'pending';