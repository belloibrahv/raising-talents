CREATE SCHEMA "messaging";
--> statement-breakpoint
CREATE TYPE "messaging"."conversation_status" AS ENUM('requested', 'accepted', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TABLE "messaging"."conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"talent_id" uuid NOT NULL,
	"status" "messaging"."conversation_status" NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	"agent_read_at" timestamp with time zone,
	"talent_read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "messaging"."messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"client_message_id" uuid NOT NULL,
	"sent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messaging"."conversations" ADD CONSTRAINT "conversations_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging"."conversations" ADD CONSTRAINT "conversations_talent_id_users_id_fk" FOREIGN KEY ("talent_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging"."messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "messaging"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging"."messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_one_per_pair" ON "messaging"."conversations" USING btree ("agent_id","talent_id");--> statement-breakpoint
CREATE INDEX "conversations_agent_updated_idx" ON "messaging"."conversations" USING btree ("agent_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "conversations_talent_updated_idx" ON "messaging"."conversations" USING btree ("talent_id","updated_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_one_per_client_id" ON "messaging"."messages" USING btree ("conversation_id","sender_id","client_message_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_sent_idx" ON "messaging"."messages" USING btree ("conversation_id","sent_at","id");--> statement-breakpoint
CREATE INDEX "messages_sender_idx" ON "messaging"."messages" USING btree ("sender_id");