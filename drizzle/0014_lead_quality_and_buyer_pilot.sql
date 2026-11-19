CREATE TABLE "borynx_private"."lead_service_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"buyer_id" integer NOT NULL,
	"contact_identity_id" integer,
	"kind" varchar(16) NOT NULL,
	"state" varchar(12) DEFAULT 'requested' NOT NULL,
	"amount_minor" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"sponsor_until" timestamp with time zone,
	"handled_by_id" integer,
	CONSTRAINT "lead_service_orders_kind" CHECK ("borynx_private"."lead_service_orders"."kind" in ('assisted_hire', 'sponsored_lead')),
	CONSTRAINT "lead_service_orders_state" CHECK ("borynx_private"."lead_service_orders"."state" in ('requested', 'confirmed', 'delivered', 'declined', 'refunded')),
	CONSTRAINT "lead_service_orders_amount" CHECK ("borynx_private"."lead_service_orders"."amount_minor" > 0 and "borynx_private"."lead_service_orders"."amount_minor" % 100 = 0),
	CONSTRAINT "lead_service_orders_confirmation" CHECK (("borynx_private"."lead_service_orders"."confirmed_at" is not null) = ("borynx_private"."lead_service_orders"."state" in ('confirmed', 'delivered', 'refunded'))),
	CONSTRAINT "lead_service_orders_placement_window" CHECK (
    ("borynx_private"."lead_service_orders"."sponsor_until" is not null) = ("borynx_private"."lead_service_orders"."kind" = 'sponsored_lead' and "borynx_private"."lead_service_orders"."confirmed_at" is not null)
    and ("borynx_private"."lead_service_orders"."sponsor_until" is null or "borynx_private"."lead_service_orders"."sponsor_until" > "borynx_private"."lead_service_orders"."confirmed_at")),
	CONSTRAINT "lead_service_orders_delivery" CHECK ("borynx_private"."lead_service_orders"."state" <> 'delivered' or "borynx_private"."lead_service_orders"."kind" = 'assisted_hire')
);
--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_service_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "delivery_timeline" varchar(160);--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_service_orders" ADD CONSTRAINT "lead_service_orders_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_service_orders" ADD CONSTRAINT "lead_service_orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_service_orders" ADD CONSTRAINT "lead_service_orders_contact_identity_id_auth_identities_id_fk" FOREIGN KEY ("contact_identity_id") REFERENCES "borynx_private"."auth_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_service_orders" ADD CONSTRAINT "lead_service_orders_handled_by_id_users_id_fk" FOREIGN KEY ("handled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_service_orders_lead_kind_idx" ON "borynx_private"."lead_service_orders" USING btree ("lead_id","kind");--> statement-breakpoint
CREATE INDEX "lead_service_orders_buyer_recent_idx" ON "borynx_private"."lead_service_orders" USING btree ("buyer_id","created_at","id");--> statement-breakpoint
CREATE INDEX "lead_service_orders_sponsor_idx" ON "borynx_private"."lead_service_orders" USING btree ("sponsor_until") WHERE "borynx_private"."lead_service_orders"."kind" = 'sponsored_lead' and "borynx_private"."lead_service_orders"."state" = 'confirmed';
--> statement-breakpoint
REVOKE ALL ON TABLE borynx_private.lead_service_orders FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON SEQUENCE borynx_private.lead_service_orders_id_seq FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE
  browser_role text;
BEGIN
  FOR browser_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL ON TABLE borynx_private.lead_service_orders FROM %I', browser_role);
    EXECUTE format('REVOKE ALL ON SEQUENCE borynx_private.lead_service_orders_id_seq FROM %I', browser_role);
  END LOOP;
END $$;
