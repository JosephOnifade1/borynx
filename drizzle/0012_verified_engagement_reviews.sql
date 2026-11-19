CREATE TYPE "borynx_private"."lead_review_visibility" AS ENUM('published', 'pending_review', 'hidden');--> statement-breakpoint
ALTER TYPE "public"."report_target" ADD VALUE 'lead_review';--> statement-breakpoint
CREATE TABLE "borynx_private"."lead_review_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"review_id" integer NOT NULL,
	"moderator_id" integer,
	"action" varchar(7) NOT NULL,
	"reason" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_review_decisions_action" CHECK ("borynx_private"."lead_review_decisions"."action" in ('publish', 'hide', 'restore')),
	CONSTRAINT "lead_review_decisions_reason" CHECK (length(trim("borynx_private"."lead_review_decisions"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_review_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "borynx_private"."lead_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"reviewer_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"rating" smallint NOT NULL,
	"testimonial" text NOT NULL,
	"visibility" "borynx_private"."lead_review_visibility" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_id" integer,
	"review_note" varchar(500),
	CONSTRAINT "lead_reviews_lead_id_unique" UNIQUE("lead_id"),
	CONSTRAINT "lead_reviews_rating_range" CHECK ("borynx_private"."lead_reviews"."rating" between 1 and 5),
	CONSTRAINT "lead_reviews_distinct_participants" CHECK ("borynx_private"."lead_reviews"."reviewer_id" <> "borynx_private"."lead_reviews"."recipient_id"),
	CONSTRAINT "lead_reviews_testimonial_length" CHECK (length(trim("borynx_private"."lead_reviews"."testimonial")) between 20 and 2000)
);
--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_review_decisions" ADD CONSTRAINT "lead_review_decisions_review_id_lead_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "borynx_private"."lead_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_review_decisions" ADD CONSTRAINT "lead_review_decisions_moderator_id_users_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_reviews" ADD CONSTRAINT "lead_reviews_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_reviews" ADD CONSTRAINT "lead_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_reviews" ADD CONSTRAINT "lead_reviews_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_reviews" ADD CONSTRAINT "lead_reviews_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_review_decisions_review_idx" ON "borynx_private"."lead_review_decisions" USING btree ("review_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_reviews_recipient_recent_idx" ON "borynx_private"."lead_reviews" USING btree ("recipient_id","visibility","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "lead_reviews_reviewer_idx" ON "borynx_private"."lead_reviews" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "lead_reviews_queue_idx" ON "borynx_private"."lead_reviews" USING btree ("visibility","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "borynx_private"."lead_reviews"."visibility" <> 'published';
--> statement-breakpoint
REVOKE ALL ON TABLE borynx_private.lead_reviews, borynx_private.lead_review_decisions FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON SEQUENCE borynx_private.lead_reviews_id_seq, borynx_private.lead_review_decisions_id_seq FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE
  browser_role text;
BEGIN
  FOR browser_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL ON TABLE borynx_private.lead_reviews, borynx_private.lead_review_decisions FROM %I', browser_role);
    EXECUTE format('REVOKE ALL ON SEQUENCE borynx_private.lead_reviews_id_seq, borynx_private.lead_review_decisions_id_seq FROM %I', browser_role);
  END LOOP;
END $$;
