CREATE SCHEMA "media";
--> statement-breakpoint
CREATE TYPE "media"."purpose" AS ENUM('avatar', 'portfolio');--> statement-breakpoint
CREATE TYPE "media"."status" AS ENUM('awaiting_upload', 'processing', 'scanning', 'ready', 'held_for_review', 'rejected', 'failed', 'deleted');--> statement-breakpoint
CREATE TABLE "media"."assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"purpose" "media"."purpose" NOT NULL,
	"status" "media"."status" NOT NULL,
	"content_type" text NOT NULL,
	"declared_bytes" integer NOT NULL,
	"actual_bytes" integer,
	"moderation_labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rejection_reason" text,
	"failure_reason" text,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media"."assets" ADD CONSTRAINT "assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_owner_idx" ON "media"."assets" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "assets_awaiting_upload_idx" ON "media"."assets" USING btree ("created_at") WHERE status = 'awaiting_upload';