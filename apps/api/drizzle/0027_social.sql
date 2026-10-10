CREATE SCHEMA "social";
--> statement-breakpoint
CREATE TABLE "social"."follows" (
	"follower_id" uuid NOT NULL,
	"talent_id" uuid NOT NULL,
	"followed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "follows_follower_id_talent_id_pk" PRIMARY KEY("follower_id","talent_id")
);
--> statement-breakpoint
CREATE TABLE "social"."likes" (
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"liked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "likes_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "social"."follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."follows" ADD CONSTRAINT "follows_talent_id_users_id_fk" FOREIGN KEY ("talent_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."likes" ADD CONSTRAINT "likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."likes" ADD CONSTRAINT "likes_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "portfolio"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follows_follower_recent_idx" ON "social"."follows" USING btree ("follower_id","followed_at","talent_id");--> statement-breakpoint
CREATE INDEX "follows_talent_idx" ON "social"."follows" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "likes_item_idx" ON "social"."likes" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "items_created_idx" ON "portfolio"."items" USING btree ("created_at","id");