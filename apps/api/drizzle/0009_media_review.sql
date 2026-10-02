ALTER TABLE "media"."assets" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "media"."assets" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media"."assets" ADD CONSTRAINT "assets_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "accounts"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_held_idx" ON "media"."assets" USING btree ("updated_at","id") WHERE status = 'held_for_review';