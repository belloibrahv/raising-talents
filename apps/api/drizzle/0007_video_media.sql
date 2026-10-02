ALTER TYPE "portfolio"."item_kind" ADD VALUE 'video';--> statement-breakpoint
ALTER TABLE "media"."assets" ADD COLUMN "provider_upload_id" text;--> statement-breakpoint
ALTER TABLE "media"."assets" ADD COLUMN "provider_asset_id" text;--> statement-breakpoint
ALTER TABLE "media"."assets" ADD COLUMN "playback_id" text;--> statement-breakpoint
ALTER TABLE "media"."assets" ADD COLUMN "duration_seconds" real;