ALTER TYPE "identity"."code_purpose" ADD VALUE 'email_change';--> statement-breakpoint
CREATE TABLE "identity"."email_changes" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"new_email" text NOT NULL,
	"previous_email" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "identity"."email_changes" ADD CONSTRAINT "email_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;