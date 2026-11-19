ALTER TYPE "public"."notification_type" ADD VALUE 'lead_kickoff';--> statement-breakpoint
CREATE TABLE "borynx_private"."lead_kickoffs" (
	"lead_id" integer PRIMARY KEY NOT NULL,
	"bid_id" integer NOT NULL,
	"buyer_id" integer NOT NULL,
	"winner_id" integer NOT NULL,
	"note" text NOT NULL,
	"contact" text NOT NULL,
	"start_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	CONSTRAINT "lead_kickoffs_distinct_participants" CHECK ("borynx_private"."lead_kickoffs"."buyer_id" <> "borynx_private"."lead_kickoffs"."winner_id"),
	CONSTRAINT "lead_kickoffs_note_length" CHECK (length(trim("borynx_private"."lead_kickoffs"."note")) between 10 and 1000),
	CONSTRAINT "lead_kickoffs_contact_length" CHECK (length(trim("borynx_private"."lead_kickoffs"."contact")) between 3 and 200)
);
--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_kickoffs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_kickoffs" ADD CONSTRAINT "lead_kickoffs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_kickoffs" ADD CONSTRAINT "lead_kickoffs_bid_id_lead_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."lead_bids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_kickoffs" ADD CONSTRAINT "lead_kickoffs_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_kickoffs" ADD CONSTRAINT "lead_kickoffs_winner_id_users_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_kickoffs_bid_idx" ON "borynx_private"."lead_kickoffs" USING btree ("bid_id");--> statement-breakpoint
CREATE INDEX "lead_kickoffs_buyer_idx" ON "borynx_private"."lead_kickoffs" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "lead_kickoffs_winner_idx" ON "borynx_private"."lead_kickoffs" USING btree ("winner_id");
--> statement-breakpoint
REVOKE ALL ON TABLE borynx_private.lead_kickoffs FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE
  browser_role text;
BEGIN
  FOR browser_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL ON TABLE borynx_private.lead_kickoffs FROM %I', browser_role);
  END LOOP;
END $$;
