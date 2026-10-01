CREATE SCHEMA "platform";
--> statement-breakpoint
CREATE SCHEMA "accounts";
--> statement-breakpoint
CREATE SCHEMA "identity";
--> statement-breakpoint
CREATE TYPE "accounts"."account_status" AS ENUM('onboarding', 'active', 'suspended', 'banned', 'pending_deletion');--> statement-breakpoint
CREATE TYPE "accounts"."role" AS ENUM('talent', 'agent', 'moderator', 'admin');--> statement-breakpoint
CREATE TYPE "identity"."code_purpose" AS ENUM('email_verification');--> statement-breakpoint
CREATE TYPE "identity"."session_revoked_reason" AS ENUM('rotated', 'signed_out', 'reuse_detected', 'device_mismatch', 'account_blocked');--> statement-breakpoint
CREATE TABLE "platform"."outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"role" "accounts"."role",
	"role_locked_at" timestamp with time zone,
	"status" "accounts"."account_status" NOT NULL,
	"date_of_birth" date NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"deletion_scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."one_time_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "identity"."code_purpose" NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" "identity"."session_revoked_reason",
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."credentials" ADD CONSTRAINT "credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."one_time_codes" ADD CONSTRAINT "one_time_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "platform"."outbox" USING btree ("occurred_at") WHERE published_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "accounts"."users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "one_time_codes_user_purpose_idx" ON "identity"."one_time_codes" USING btree ("user_id","purpose","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh_token_hash_unique" ON "identity"."sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "sessions_family_idx" ON "identity"."sessions" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "sessions_user_active_idx" ON "identity"."sessions" USING btree ("user_id") WHERE revoked_at is null;