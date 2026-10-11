DROP INDEX "safety"."reports_one_open_per_reporter";--> statement-breakpoint
ALTER TABLE "safety"."reports" ADD COLUMN "media_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_one_open_per_reporter_post" ON "safety"."reports" USING btree ("reporter_id","media_id") WHERE status = 'open' and media_id is not null;--> statement-breakpoint
CREATE INDEX "reports_open_media_idx" ON "safety"."reports" USING btree ("subject_id","media_id") WHERE status = 'open' and media_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_one_open_per_reporter" ON "safety"."reports" USING btree ("reporter_id","subject_id") WHERE status = 'open' and media_id is null;