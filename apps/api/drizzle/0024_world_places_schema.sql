CREATE TABLE "taxonomy"."countries" (
	"code" varchar(2) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"search_terms" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "taxonomy"."cities" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "taxonomy"."cities" ADD COLUMN "population" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "cities_country_idx" ON "taxonomy"."cities" USING btree ("country_code");