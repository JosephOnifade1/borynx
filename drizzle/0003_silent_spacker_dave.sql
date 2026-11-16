ALTER TABLE "lead_bids" ADD COLUMN "is_accepted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "assigned_user_id" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "accepted_bid_id" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;