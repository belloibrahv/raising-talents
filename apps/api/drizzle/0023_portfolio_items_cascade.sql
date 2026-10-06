ALTER TABLE "portfolio"."items" DROP CONSTRAINT "items_media_id_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "portfolio"."items" ADD CONSTRAINT "items_media_id_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "media"."assets"("id") ON DELETE cascade ON UPDATE no action;