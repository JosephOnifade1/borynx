CREATE TYPE "public"."lead_budget_unit" AS ENUM('fixed', 'hourly');--> statement-breakpoint
CREATE TYPE "public"."lead_publication_status" AS ENUM('pending_review', 'changes_requested', 'published', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'lead_review_decision';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "budget_unit" "lead_budget_unit";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "skill_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "publication_status" "lead_publication_status" DEFAULT 'pending_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "reviewed_by_id" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "review_note" varchar(1000);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "submission_key" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_publication_created_idx" ON "leads" USING btree ("publication_status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_author_submission_idx" ON "leads" USING btree ("author_id","submission_key") WHERE "leads"."submission_key" is not null;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_skill_tags_max" CHECK (cardinality("leads"."skill_tags") <= 6);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_revision_positive" CHECK ("leads"."revision" >= 1);--> statement-breakpoint
-- Preserve known-public legacy listings only. Budget values/units, bids, assignments,
-- removal flags, and engagement status are not rewritten; no review evidence is invented.
UPDATE "public"."leads" AS l
SET "publication_status" = 'published'
WHERE NOT l."is_removed"
  AND (l."space_id" IS NULL OR EXISTS (
    SELECT 1 FROM "public"."spaces" AS s
    WHERE s."id" = l."space_id" AND s."privacy" = 'public'
  ));
