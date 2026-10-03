CREATE SCHEMA "portfolio";
--> statement-breakpoint
CREATE TYPE "portfolio"."item_kind" AS ENUM('image');--> statement-breakpoint
CREATE TABLE "portfolio"."items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"talent_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"kind" "portfolio"."item_kind" NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio"."portfolios" (
	"talent_id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portfolio"."items" ADD CONSTRAINT "items_talent_id_portfolios_talent_id_fk" FOREIGN KEY ("talent_id") REFERENCES "portfolio"."portfolios"("talent_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio"."items" ADD CONSTRAINT "items_media_id_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "media"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio"."portfolios" ADD CONSTRAINT "portfolios_talent_id_users_id_fk" FOREIGN KEY ("talent_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "items_media_unique" ON "portfolio"."items" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "items_talent_position_idx" ON "portfolio"."items" USING btree ("talent_id","position");