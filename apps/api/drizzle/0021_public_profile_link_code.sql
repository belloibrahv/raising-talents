ALTER TABLE "talent"."profiles" ADD COLUMN "share_code" text;--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_share_code_unique" ON "talent"."profiles" USING btree ("share_code");