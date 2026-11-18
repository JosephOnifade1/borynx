ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "author_deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "post_snapshot" jsonb;