CREATE SCHEMA "shortlist";
--> statement-breakpoint
CREATE TABLE "shortlist"."entries" (
	"agent_id" uuid NOT NULL,
	"talent_id" uuid NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "entries_agent_id_talent_id_pk" PRIMARY KEY("agent_id","talent_id")
);
--> statement-breakpoint
ALTER TABLE "shortlist"."entries" ADD CONSTRAINT "entries_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist"."entries" ADD CONSTRAINT "entries_talent_id_users_id_fk" FOREIGN KEY ("talent_id") REFERENCES "accounts"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shortlist_entries_agent_saved_idx" ON "shortlist"."entries" USING btree ("agent_id","saved_at","talent_id");--> statement-breakpoint
CREATE INDEX "shortlist_entries_talent_idx" ON "shortlist"."entries" USING btree ("talent_id");