ALTER TYPE "public"."lead_status" ADD VALUE 'awarded';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'completed';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'lead_bid_accepted';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "awarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "award_needs_review" boolean DEFAULT false NOT NULL;
