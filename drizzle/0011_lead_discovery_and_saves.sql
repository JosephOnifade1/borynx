CREATE TABLE "borynx_private"."lead_saves" (
	"user_id" integer NOT NULL,
	"lead_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_saves_user_id_lead_id_pk" PRIMARY KEY("user_id","lead_id")
);
--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_saves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_saves" ADD CONSTRAINT "lead_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_saves" ADD CONSTRAINT "lead_saves_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_saves_user_recent_idx" ON "borynx_private"."lead_saves" USING btree ("user_id","created_at" DESC NULLS FIRST,"lead_id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "lead_saves_lead_idx" ON "borynx_private"."lead_saves" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "leads_public_recent_idx" ON "leads" USING btree ("created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "leads"."publication_status" = 'published' and "leads"."is_removed" = false;--> statement-breakpoint
CREATE INDEX "leads_public_open_recent_idx" ON "leads" USING btree ("created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "leads"."publication_status" = 'published' and "leads"."is_removed" = false and "leads"."status" = 'open'
        and "leads"."award_needs_review" = false and "leads"."accepted_bid_id" is null and "leads"."assigned_user_id" is null;
--> statement-breakpoint
REVOKE ALL ON TABLE "borynx_private"."lead_saves" FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE
  browser_role text;
BEGIN
  FOR browser_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL ON TABLE borynx_private.lead_saves FROM %I', browser_role);
  END LOOP;
END $$;
