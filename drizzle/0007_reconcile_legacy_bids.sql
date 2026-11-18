CREATE TABLE "lead_bid_archive" (
	"bid_id" integer PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"message" text NOT NULL,
	"was_accepted" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"reason" varchar(24) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_bid_archive" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lead_bid_archive" ADD CONSTRAINT "lead_bid_archive_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_bid_archive" ADD CONSTRAINT "lead_bid_archive_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_bid_archive_lead_idx" ON "lead_bid_archive" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_bid_archive_user_idx" ON "lead_bid_archive" USING btree ("user_id");--> statement-breakpoint
-- 0006 must be committed before this file uses the new engagement enum values.
LOCK TABLE "public"."leads", "public"."lead_bids" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
-- An award is credible only when the canonical bid, lead and assigned user agree.
-- Preserve suspicious legacy pointers, but do not infer a winner from a loose accepted flag.
UPDATE "public"."leads" AS l
SET "award_needs_review" = true
WHERE (l."accepted_bid_id" IS NOT NULL OR l."assigned_user_id" IS NOT NULL OR EXISTS (
  SELECT 1 FROM "public"."lead_bids" AS b WHERE b."lead_id" = l."id" AND b."is_accepted"
)) AND NOT (l."status" = 'closed' AND EXISTS (
  SELECT 1 FROM "public"."lead_bids" AS b
  WHERE b."id" = l."accepted_bid_id" AND b."lead_id" = l."id"
    AND b."user_id" = l."assigned_user_id" AND b."user_id" <> l."author_id"
));--> statement-breakpoint
UPDATE "public"."leads" AS l
SET "status" = 'awarded'
WHERE l."status" = 'closed' AND NOT l."award_needs_review" AND EXISTS (
  SELECT 1 FROM "public"."lead_bids" AS b
  WHERE b."id" = l."accepted_bid_id" AND b."lead_id" = l."id"
    AND b."user_id" = l."assigned_user_id" AND b."user_id" <> l."author_id"
);--> statement-breakpoint
-- Prefer the referenced bid; otherwise keep the earliest pitch for each lead/bidder.
-- Copy duplicates and any cleared acceptance markers before changing active bids.
WITH ranked AS (
  SELECT b.*, l."status", l."accepted_bid_id",
    row_number() OVER (PARTITION BY b."lead_id", b."user_id"
      ORDER BY (b."id" IS NOT DISTINCT FROM l."accepted_bid_id") DESC, b."created_at", b."id") AS rank
  FROM "public"."lead_bids" AS b JOIN "public"."leads" AS l ON l."id" = b."lead_id"
)
INSERT INTO "public"."lead_bid_archive" ("bid_id", "lead_id", "user_id", "amount", "message", "was_accepted", "created_at", "reason")
SELECT "id", "lead_id", "user_id", "amount", "message", "is_accepted", "created_at",
       CASE WHEN rank > 1 THEN 'duplicate' ELSE 'legacy_acceptance' END
FROM ranked
WHERE rank > 1 OR ("is_accepted" AND ("status" <> 'awarded' OR "id" IS DISTINCT FROM "accepted_bid_id"));--> statement-breakpoint
DELETE FROM "public"."lead_bids" AS b USING "public"."lead_bid_archive" AS a
WHERE a."bid_id" = b."id" AND a."reason" = 'duplicate';--> statement-breakpoint
UPDATE "public"."lead_bids" AS b
SET "is_accepted" = (l."status" = 'awarded' AND b."id" IS NOT DISTINCT FROM l."accepted_bid_id")
FROM "public"."leads" AS l
WHERE l."id" = b."lead_id"
  AND b."is_accepted" IS DISTINCT FROM (l."status" = 'awarded' AND b."id" IS NOT DISTINCT FROM l."accepted_bid_id");--> statement-breakpoint
WITH counts AS (
  SELECT l."id", count(b."id")::int AS n
  FROM "public"."leads" AS l LEFT JOIN "public"."lead_bids" AS b ON b."lead_id" = l."id"
  GROUP BY l."id"
)
UPDATE "public"."leads" AS l SET "bid_count" = counts.n FROM counts
WHERE l."id" = counts."id" AND l."bid_count" IS DISTINCT FROM counts.n;--> statement-breakpoint
CREATE INDEX "lead_bids_user_created_idx" ON "lead_bids" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_bids_lead_user_idx" ON "lead_bids" USING btree ("lead_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_bids_one_winner_idx" ON "lead_bids" USING btree ("lead_id") WHERE "lead_bids"."is_accepted";
