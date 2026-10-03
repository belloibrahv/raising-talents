CREATE TABLE "notifications"."inbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notifications"."inbox" ADD CONSTRAINT "inbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_key_unique" ON "notifications"."inbox" USING btree ("key");--> statement-breakpoint
CREATE INDEX "inbox_user_created_idx" ON "notifications"."inbox" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "inbox_user_unread_idx" ON "notifications"."inbox" USING btree ("user_id") WHERE read_at is null;--> statement-breakpoint
CREATE INDEX "inbox_created_idx" ON "notifications"."inbox" USING btree ("created_at");