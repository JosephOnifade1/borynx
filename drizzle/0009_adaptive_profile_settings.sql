ALTER TABLE "users" ADD COLUMN "looking_to_hire" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "available_for_work" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company_name_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company_url" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "hourly_rate" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "hourly_currency" varchar(3);--> statement-breakpoint
CREATE INDEX "leads_public_author_idx" ON "leads" USING btree ("author_id") WHERE "leads"."publication_status" = 'published' and "leads"."is_removed" = false;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_hourly_rate_pair" CHECK (("users"."hourly_rate" is null and "users"."hourly_currency" is null) or
      ("users"."hourly_rate" is not null and "users"."hourly_currency" is not null and "users"."hourly_rate" between 1 and 10000000 and "users"."hourly_currency" in ('USD', 'EUR', 'GBP')));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_public_company_name_set" CHECK (not "users"."company_name_public" or ("users"."company_name" is not null and length(trim("users"."company_name")) > 0));