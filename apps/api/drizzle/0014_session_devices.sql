ALTER TYPE "identity"."session_revoked_reason" ADD VALUE 'password_changed';--> statement-breakpoint
ALTER TABLE "identity"."sessions" ADD COLUMN "device_label" text;