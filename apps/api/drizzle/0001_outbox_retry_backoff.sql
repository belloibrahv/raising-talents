DROP INDEX "platform"."outbox_unpublished_idx";--> statement-breakpoint
ALTER TABLE "platform"."outbox" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "platform"."outbox" USING btree ("next_attempt_at") WHERE published_at is null;