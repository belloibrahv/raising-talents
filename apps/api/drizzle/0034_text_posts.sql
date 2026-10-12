ALTER TYPE "portfolio"."item_kind" ADD VALUE 'text';--> statement-breakpoint
ALTER TABLE "portfolio"."items" ALTER COLUMN "media_id" DROP NOT NULL;