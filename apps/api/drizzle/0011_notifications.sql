CREATE SCHEMA "notifications";
--> statement-breakpoint
CREATE TABLE "notifications"."sent" (
	"key" text PRIMARY KEY NOT NULL,
	"sent_at" timestamp with time zone NOT NULL
);
