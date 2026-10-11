CREATE TYPE "agent"."roster_status" AS ENUM('open', 'full');--> statement-breakpoint
CREATE TABLE "agent"."saved" (
	"user_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	CONSTRAINT "saved_user_id_agent_id_pk" PRIMARY KEY("user_id","agent_id")
);
--> statement-breakpoint
ALTER TABLE "agent"."profiles" ADD COLUMN "bio" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent"."profiles" ADD COLUMN "roster_status" "agent"."roster_status";--> statement-breakpoint
ALTER TABLE "agent"."profiles" ADD COLUMN "avatar_media_id" uuid;--> statement-breakpoint
ALTER TABLE "agent"."saved" ADD CONSTRAINT "saved_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent"."saved" ADD CONSTRAINT "saved_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_user_saved_idx" ON "agent"."saved" USING btree ("user_id","saved_at","agent_id");--> statement-breakpoint
CREATE INDEX "saved_agent_idx" ON "agent"."saved" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "profiles_listed_idx" ON "agent"."profiles" USING btree ("verified_at","user_id") WHERE verified_at is not null and completed_at is not null;--> statement-breakpoint
CREATE INDEX "profiles_city_idx" ON "agent"."profiles" USING btree ("city_slug");