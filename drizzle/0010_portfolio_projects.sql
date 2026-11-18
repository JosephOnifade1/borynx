CREATE TABLE "borynx_private"."portfolio_project_covers" (
	"project_id" integer PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"alt_text" varchar(160) DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_project_cover_size" CHECK (octet_length("borynx_private"."portfolio_project_covers"."bytes") between 1 and 3145728)
);
--> statement-breakpoint
ALTER TABLE "borynx_private"."portfolio_project_covers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "borynx_private"."portfolio_project_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"moderator_id" integer,
	"action" varchar(7) NOT NULL,
	"reason" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_project_decisions_action" CHECK ("borynx_private"."portfolio_project_decisions"."action" in ('hide', 'restore')),
	CONSTRAINT "portfolio_project_decisions_reason" CHECK (length(trim("borynx_private"."portfolio_project_decisions"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "borynx_private"."portfolio_project_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "borynx_private"."portfolio_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" text NOT NULL,
	"role_outcome" varchar(500),
	"live_url" varchar(255),
	"repo_url" varchar(255),
	"tech_tags" varchar(24)[] NOT NULL,
	"position" integer NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_projects_user_position_unique" UNIQUE("user_id","position") DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "portfolio_projects_position_range" CHECK ("borynx_private"."portfolio_projects"."position" between 0 and 5),
	CONSTRAINT "portfolio_projects_title_length" CHECK (length(trim("borynx_private"."portfolio_projects"."title")) >= 3),
	CONSTRAINT "portfolio_projects_description_length" CHECK (length(trim("borynx_private"."portfolio_projects"."description")) between 20 and 2000),
	CONSTRAINT "portfolio_projects_tags_count" CHECK (cardinality("borynx_private"."portfolio_projects"."tech_tags") between 1 and 8)
);
--> statement-breakpoint
ALTER TABLE "borynx_private"."portfolio_projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "borynx_private"."portfolio_project_covers" ADD CONSTRAINT "portfolio_project_covers_project_id_portfolio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "borynx_private"."portfolio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borynx_private"."portfolio_project_decisions" ADD CONSTRAINT "portfolio_project_decisions_moderator_id_users_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borynx_private"."portfolio_projects" ADD CONSTRAINT "portfolio_projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portfolio_project_decisions_project_idx" ON "borynx_private"."portfolio_project_decisions" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "portfolio_projects_hidden_idx" ON "borynx_private"."portfolio_projects" USING btree ("hidden_at") WHERE "borynx_private"."portfolio_projects"."hidden_at" is not null;--> statement-breakpoint
REVOKE ALL ON TABLE "borynx_private"."portfolio_projects", "borynx_private"."portfolio_project_covers", "borynx_private"."portfolio_project_decisions" FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE
  browser_role text;
BEGIN
  FOR browser_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL ON TABLE borynx_private.portfolio_projects, borynx_private.portfolio_project_covers, borynx_private.portfolio_project_decisions FROM %I', browser_role);
  END LOOP;
END $$;
