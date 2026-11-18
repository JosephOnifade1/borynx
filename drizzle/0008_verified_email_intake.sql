CREATE SCHEMA "borynx_private";
--> statement-breakpoint
REVOKE ALL ON SCHEMA "borynx_private" FROM PUBLIC;--> statement-breakpoint
CREATE TABLE "borynx_private"."auth_identities" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar(255) NOT NULL,
	"subject" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"email" varchar(254) NOT NULL,
	"verified_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "borynx_private"."auth_identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "borynx_private"."email_auth_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_hash" varchar(64) NOT NULL,
	"ip_hash" varchar(64) NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "borynx_private"."email_auth_sends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "borynx_private"."lead_intakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" varchar(64) NOT NULL,
	"ip_hash" varchar(64) NOT NULL,
	"submission_key" uuid NOT NULL,
	"brief" jsonb,
	"display_name" varchar(80),
	"company_name" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"lead_id" integer,
	CONSTRAINT "lead_intakes_expiry_after_creation" CHECK ("borynx_private"."lead_intakes"."expires_at" > "borynx_private"."lead_intakes"."created_at"),
	CONSTRAINT "lead_intakes_consumed_only" CHECK ("borynx_private"."lead_intakes"."lead_id" is null or "borynx_private"."lead_intakes"."consumed_at" is not null),
	CONSTRAINT "lead_intakes_scrubbed_on_consumption" CHECK ("borynx_private"."lead_intakes"."consumed_at" is null or ("borynx_private"."lead_intakes"."brief" is null and "borynx_private"."lead_intakes"."display_name" is null and "borynx_private"."lead_intakes"."company_name" is null))
);
--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_intakes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "auth_identity_id" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "intake_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company_name" varchar(100);--> statement-breakpoint
ALTER TABLE "borynx_private"."auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borynx_private"."lead_intakes" ADD CONSTRAINT "lead_intakes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_provider_subject_idx" ON "borynx_private"."auth_identities" USING btree ("provider","subject");--> statement-breakpoint
CREATE INDEX "auth_identities_user_idx" ON "borynx_private"."auth_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_auth_sends_email_idx" ON "borynx_private"."email_auth_sends" USING btree ("email_hash","attempted_at");--> statement-breakpoint
CREATE INDEX "email_auth_sends_ip_idx" ON "borynx_private"."email_auth_sends" USING btree ("ip_hash","attempted_at");--> statement-breakpoint
CREATE INDEX "email_auth_sends_time_idx" ON "borynx_private"."email_auth_sends" USING btree ("attempted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_intakes_email_submission_idx" ON "borynx_private"."lead_intakes" USING btree ("email_hash","submission_key");--> statement-breakpoint
CREATE INDEX "lead_intakes_ip_created_idx" ON "borynx_private"."lead_intakes" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "lead_intakes_expiry_idx" ON "borynx_private"."lead_intakes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "lead_intakes_lead_idx" ON "borynx_private"."lead_intakes" USING btree ("lead_id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_auth_identity_id_auth_identities_id_fk" FOREIGN KEY ("auth_identity_id") REFERENCES "borynx_private"."auth_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_identity_idx" ON "sessions" USING btree ("auth_identity_id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_intake_requires_identity" CHECK ("sessions"."intake_id" is null or "sessions"."auth_identity_id" is not null);