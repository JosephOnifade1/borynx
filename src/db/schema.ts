import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  check,
  customType,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  serial,
  text,
  unique,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { LeadFields } from "@/lib/lead-input";

export const privateSchema = pgSchema("borynx_private");

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const userRoleEnum = pgEnum("user_role", ["member", "moderator", "admin"]);
export const privacyEnum = pgEnum("space_privacy", ["public", "restricted", "private"]);
export const modRoleEnum = pgEnum("mod_role", ["moderator", "owner"]);
export const postKindEnum = pgEnum("post_kind", ["discussion", "resource", "help", "showcase"]);
export const leadKindEnum = pgEnum("lead_kind", ["bounty", "contract", "job"]);
export const leadStatusEnum = pgEnum("lead_status", ["open", "in_review", "closed", "awarded", "completed", "cancelled"]);
export const leadPublicationEnum = pgEnum("lead_publication_status", ["pending_review", "changes_requested", "published", "rejected"]);
export const leadBudgetUnitEnum = pgEnum("lead_budget_unit", ["fixed", "hourly"]);
export const reportTargetEnum = pgEnum("report_target", ["post", "comment", "lead"]);
export const reportReasonEnum = pgEnum("report_reason", [
  "spam_scam",
  "off_topic",
  "unverified_lead",
  "harassment",
  "misleading_bounty",
  "automated_filter",
]);
export const reportStatusEnum = pgEnum("report_status", ["pending", "approved", "dismissed"]);
export const voteTargetEnum = pgEnum("vote_target", ["post", "comment", "lead"]);
export const modActionEnum = pgEnum("mod_action", ["warn", "suspend", "ban", "unban", "verify", "remove_content"]);
export const badgeCategoryEnum = pgEnum("badge_category", ["identity", "milestone", "marketplace", "community"]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "comment_reply",
  "solution_accepted",
  "lead_bid",
  "karma_milestone",
  "user_follow",
  "lead_review_decision",
  "lead_bid_accepted",
]);

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 32 }).notNull(),
    displayName: varchar("display_name", { length: 80 }).notNull(),
    lookingToHire: boolean("looking_to_hire").default(false).notNull(),
    availableForWork: boolean("available_for_work").default(false).notNull(),
    companyName: varchar("company_name", { length: 100 }),
    // Intake may prefill companyName privately. Only an explicit profile edit opts in to display.
    companyNamePublic: boolean("company_name_public").default(false).notNull(),
    companyUrl: varchar("company_url", { length: 255 }),
    hourlyRate: integer("hourly_rate"),
    hourlyCurrency: varchar("hourly_currency", { length: 3 }),
    headline: varchar("headline", { length: 140 }).default("").notNull(),
    bio: text("bio").default("").notNull(),
    avatarHue: integer("avatar_hue").default(20).notNull(),
    skills: jsonb("skills").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    role: userRoleEnum("role").default("member").notNull(),
    isVerified: boolean("is_verified").default(false).notNull(),
    githubUrl: varchar("github_url", { length: 255 }),
    portfolioUrl: varchar("portfolio_url", { length: 255 }),
    karma: integer("karma").default(0).notNull(),
    warningCount: integer("warning_count").default(0).notNull(),
    isBanned: boolean("is_banned").default(false).notNull(),
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    banExpiresAt: timestamp("ban_expires_at", { withTimezone: true }),
    banReason: text("ban_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("users_username_idx").on(t.username),
    check("users_hourly_rate_pair", sql`(${t.hourlyRate} is null and ${t.hourlyCurrency} is null) or
      (${t.hourlyRate} is not null and ${t.hourlyCurrency} is not null and ${t.hourlyRate} between 1 and 10000000 and ${t.hourlyCurrency} in ('USD', 'EUR', 'GBP'))`),
    check("users_public_company_name_set", sql`not ${t.companyNamePublic} or (${t.companyName} is not null and length(trim(${t.companyName})) > 0)`),
  ],
);

/** Drafts and public rows share private storage. Only application queries can publish them. */
export const portfolioProjects = privateSchema.table("portfolio_projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  description: text("description").notNull(),
  roleOutcome: varchar("role_outcome", { length: 500 }),
  liveUrl: varchar("live_url", { length: 255 }),
  repoUrl: varchar("repo_url", { length: 255 }),
  techTags: varchar("tech_tags", { length: 24 }).array().notNull(),
  position: integer("position").notNull(),
  isPublished: boolean("is_published").default(false).notNull(),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // The migration defers this constraint to commit so full-list swaps remain atomic.
  unique("portfolio_projects_user_position_unique").on(t.userId, t.position),
  check("portfolio_projects_position_range", sql`${t.position} between 0 and 5`),
  check("portfolio_projects_title_length", sql`length(trim(${t.title})) >= 3`),
  check("portfolio_projects_description_length", sql`length(trim(${t.description})) between 20 and 2000`),
  check("portfolio_projects_tags_count", sql`cardinality(${t.techTags}) between 1 and 8`),
  index("portfolio_projects_hidden_idx").on(t.hiddenAt).where(sql`${t.hiddenAt} is not null`),
]).enableRLS();

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/** A single sanitized WebP per project, with no bearer URL or independent object lifetime. */
export const portfolioProjectCovers = privateSchema.table("portfolio_project_covers", {
  projectId: integer("project_id").primaryKey().references(() => portfolioProjects.id, { onDelete: "cascade" }),
  bytes: bytea("bytes").notNull(),
  altText: varchar("alt_text", { length: 160 }).default("").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [check("portfolio_project_cover_size", sql`octet_length(${t.bytes}) between 1 and 3145728`)]).enableRLS();

/** Hold the minimal audit record even if an owner later deletes the project. */
export const portfolioProjectDecisions = privateSchema.table("portfolio_project_decisions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  moderatorId: integer("moderator_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 7 }).$type<"hide" | "restore">().notNull(),
  reason: varchar("reason", { length: 500 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("portfolio_project_decisions_project_idx").on(t.projectId, t.createdAt),
  check("portfolio_project_decisions_action", sql`${t.action} in ('hide', 'restore')`),
  check("portfolio_project_decisions_reason", sql`length(trim(${t.reason})) > 0`),
]).enableRLS();

/** Provider is scoped to the exact Supabase Auth origin, never to an email or a handle. */
export const authIdentities = privateSchema.table("auth_identities", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 255 }).notNull(),
  subject: uuid("subject").notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  email: varchar("email", { length: 254 }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
}, (t) => [
  uniqueIndex("auth_identities_provider_subject_idx").on(t.provider, t.subject),
  index("auth_identities_user_idx").on(t.userId),
]).enableRLS();

/** Opaque hashed tokens; only legacy/demo rows have no managed identity. */
export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    authIdentityId: integer("auth_identity_id").references(() => authIdentities.id, { onDelete: "cascade" }),
    // Exact intake bound at login. The receipt has its own shorter retention lifecycle.
    intakeId: uuid("intake_id"),
    userAgent: varchar("user_agent", { length: 255 }).default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("sessions_user_idx").on(t.userId),
    index("sessions_expires_idx").on(t.expiresAt),
    index("sessions_identity_idx").on(t.authIdentityId),
    check("sessions_intake_requires_identity", sql`${t.intakeId} is null or ${t.authIdentityId} is not null`),
  ],
).enableRLS();

/** Legacy usernames → canonical user (handles renames / stale links). */
export const userAliases = pgTable(
  "user_aliases",
  {
    alias: varchar("alias", { length: 32 }).primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
  },
);

/* ------------------------------------------------------------------ */
/* Spaces                                                              */
/* ------------------------------------------------------------------ */

export const spaces = pgTable(
  "spaces",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 48 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    tagline: varchar("tagline", { length: 140 }).default("").notNull(),
    description: text("description").default("").notNull(),
    privacy: privacyEnum("privacy").default("public").notNull(),
    topics: jsonb("topics").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    rules: jsonb("rules").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    accentHue: integer("accent_hue").default(20).notNull(),
    memberCount: integer("member_count").default(0).notNull(),
    createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("spaces_slug_idx").on(t.slug)],
);

export const spaceAliases = pgTable("space_aliases", {
  alias: varchar("alias", { length: 48 }).primaryKey(),
  spaceId: integer("space_id")
    .references(() => spaces.id, { onDelete: "cascade" })
    .notNull(),
});

export const memberships = pgTable(
  "memberships",
  {
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    spaceId: integer("space_id")
      .references(() => spaces.id, { onDelete: "cascade" })
      .notNull(),
    modRole: modRoleEnum("mod_role"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.spaceId] }), index("memberships_space_idx").on(t.spaceId)],
);

/* ------------------------------------------------------------------ */
/* Posts & Comments                                                    */
/* ------------------------------------------------------------------ */

export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    spaceId: integer("space_id")
      .references(() => spaces.id, { onDelete: "cascade" })
      .notNull(),
    authorId: integer("author_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    slug: varchar("slug", { length: 96 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").default("").notNull(),
    kind: postKindEnum("kind").default("discussion").notNull(),
    upvotes: integer("upvotes").default(0).notNull(),
    downvotes: integer("downvotes").default(0).notNull(),
    commentCount: integer("comment_count").default(0).notNull(),
    isSolved: boolean("is_solved").default(false).notNull(),
    solutionCommentId: integer("solution_comment_id"),
    isRemoved: boolean("is_removed").default(false).notNull(),
    isPinned: boolean("is_pinned").default(false).notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    authorDeletedAt: timestamp("author_deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("posts_space_created_idx").on(t.spaceId, t.createdAt), index("posts_author_idx").on(t.authorId)],
);

export const comments = pgTable(
  "comments",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .references(() => posts.id, { onDelete: "cascade" })
      .notNull(),
    authorId: integer("author_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    parentId: integer("parent_id"),
    body: text("body").notNull(),
    upvotes: integer("upvotes").default(0).notNull(),
    downvotes: integer("downvotes").default(0).notNull(),
    isSolution: boolean("is_solution").default(false).notNull(),
    isRemoved: boolean("is_removed").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("comments_post_idx").on(t.postId), index("comments_author_idx").on(t.authorId)],
);

export const votes = pgTable(
  "votes",
  {
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    targetType: voteTargetEnum("target_type").notNull(),
    targetId: integer("target_id").notNull(),
    value: integer("value").notNull(), // 1 | -1
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.targetType, t.targetId] })],
);

export const saves = pgTable(
  "saves",
  {
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    postId: integer("post_id")
      .references(() => posts.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] })],
);

/* ------------------------------------------------------------------ */
/* Leads marketplace                                                   */
/* ------------------------------------------------------------------ */

export const leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    authorId: integer("author_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    spaceId: integer("space_id").references(() => spaces.id, { onDelete: "set null" }),
    slug: varchar("slug", { length: 96 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description").notNull(),
    category: varchar("category", { length: 48 }).notNull(),
    kind: leadKindEnum("kind").default("contract").notNull(),
    budgetMin: integer("budget_min").default(0).notNull(),
    budgetMax: integer("budget_max").default(0).notNull(),
    budgetUnit: leadBudgetUnitEnum("budget_unit"), // Unknown on historical rows.
    skillTags: text("skill_tags").array().default(sql`ARRAY[]::text[]`).notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    location: varchar("location", { length: 80 }).default("Remote").notNull(),
    isVerified: boolean("is_verified").default(false).notNull(),
    isEscrowed: boolean("is_escrowed").default(false).notNull(),
    status: leadStatusEnum("status").default("open").notNull(),
    publicationStatus: leadPublicationEnum("publication_status").default("pending_review").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedById: integer("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewNote: varchar("review_note", { length: 1000 }),
    revision: integer("revision").default(1).notNull(),
    submissionKey: uuid("submission_key"),
    upvotes: integer("upvotes").default(0).notNull(),
    downvotes: integer("downvotes").default(0).notNull(),
    bidCount: integer("bid_count").default(0).notNull(),
    assignedUserId: integer("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    acceptedBidId: integer("accepted_bid_id"),
    awardedAt: timestamp("awarded_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    awardNeedsReview: boolean("award_needs_review").default(false).notNull(),
    isRemoved: boolean("is_removed").default(false).notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("leads_created_idx").on(t.createdAt),
    index("leads_category_idx").on(t.category),
    index("leads_publication_created_idx").on(t.publicationStatus, t.createdAt),
    index("leads_public_author_idx").on(t.authorId).where(sql`${t.publicationStatus} = 'published' and ${t.isRemoved} = false`),
    uniqueIndex("leads_author_submission_idx").on(t.authorId, t.submissionKey).where(sql`${t.submissionKey} is not null`),
    check("leads_skill_tags_max", sql`cardinality(${t.skillTags}) <= 6`),
    check("leads_revision_positive", sql`${t.revision} >= 1`),
  ],
);

/** Unowned, short-lived drafts are separate from marketplace leads and queues. */
export const leadIntakes = privateSchema.table("lead_intakes", {
  id: uuid("id").defaultRandom().primaryKey(),
  emailHash: varchar("email_hash", { length: 64 }).notNull(),
  ipHash: varchar("ip_hash", { length: 64 }).notNull(),
  submissionKey: uuid("submission_key").notNull(),
  brief: jsonb("brief").$type<LeadFields>(),
  displayName: varchar("display_name", { length: 80 }),
  companyName: varchar("company_name", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  leadId: integer("lead_id").references(() => leads.id, { onDelete: "set null" }),
}, (t) => [
  uniqueIndex("lead_intakes_email_submission_idx").on(t.emailHash, t.submissionKey),
  index("lead_intakes_ip_created_idx").on(t.ipHash, t.createdAt),
  index("lead_intakes_expiry_idx").on(t.expiresAt),
  index("lead_intakes_lead_idx").on(t.leadId),
  check("lead_intakes_expiry_after_creation", sql`${t.expiresAt} > ${t.createdAt}`),
  check("lead_intakes_consumed_only", sql`${t.leadId} is null or ${t.consumedAt} is not null`),
  check("lead_intakes_scrubbed_on_consumption", sql`${t.consumedAt} is null or (${t.brief} is null and ${t.displayName} is null and ${t.companyName} is null)`),
]).enableRLS();

/** Only keyed fingerprints and dates; reserve a send before calling the provider. */
export const emailAuthSends = privateSchema.table("email_auth_sends", {
  id: serial("id").primaryKey(),
  emailHash: varchar("email_hash", { length: 64 }).notNull(),
  ipHash: varchar("ip_hash", { length: 64 }).notNull(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("email_auth_sends_email_idx").on(t.emailHash, t.attemptedAt),
  index("email_auth_sends_ip_idx").on(t.ipHash, t.attemptedAt),
  index("email_auth_sends_time_idx").on(t.attemptedAt),
]).enableRLS();

export const leadBids = pgTable(
  "lead_bids",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id")
      .references(() => leads.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    amount: integer("amount").default(0).notNull(),
    message: text("message").notNull(),
    isAccepted: boolean("is_accepted").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("lead_bids_lead_idx").on(t.leadId),
    index("lead_bids_user_created_idx").on(t.userId, t.createdAt),
    uniqueIndex("lead_bids_lead_user_idx").on(t.leadId, t.userId),
    uniqueIndex("lead_bids_one_winner_idx").on(t.leadId).where(sql`${t.isAccepted}`),
  ],
);

/** Migration evidence only; never served as active pitches. */
export const leadBidArchive = pgTable("lead_bid_archive", {
  bidId: integer("bid_id").primaryKey(),
  leadId: integer("lead_id").references(() => leads.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  amount: integer("amount").notNull(),
  message: text("message").notNull(),
  wasAccepted: boolean("was_accepted").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  reason: varchar("reason", { length: 24 }).notNull(),
}, (t) => [index("lead_bid_archive_lead_idx").on(t.leadId), index("lead_bid_archive_user_idx").on(t.userId)]).enableRLS();

/* ------------------------------------------------------------------ */
/* Moderation                                                          */
/* ------------------------------------------------------------------ */

export const reports = pgTable(
  "reports",
  {
    id: serial("id").primaryKey(),
    reporterId: integer("reporter_id").references(() => users.id, { onDelete: "set null" }),
    targetType: reportTargetEnum("target_type").notNull(),
    targetId: integer("target_id").notNull(),
    spaceId: integer("space_id").references(() => spaces.id, { onDelete: "cascade" }),
    reason: reportReasonEnum("reason").notNull(),
    details: text("details").default("").notNull(),
    postSnapshot: jsonb("post_snapshot").$type<{ title: string; body: string }>(),
    status: reportStatusEnum("status").default("pending").notNull(),
    reviewedById: integer("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("reports_status_idx").on(t.status), index("reports_target_idx").on(t.targetType, t.targetId)],
);

export const modActions = pgTable("mod_actions", {
  id: serial("id").primaryKey(),
  moderatorId: integer("moderator_id").references(() => users.id, { onDelete: "set null" }),
  targetUserId: integer("target_user_id").references(() => users.id, { onDelete: "cascade" }),
  action: modActionEnum("action").notNull(),
  reason: text("reason").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Gamification                                                        */
/* ------------------------------------------------------------------ */

export const badges = pgTable(
  "badges",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 48 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    description: varchar("description", { length: 200 }).notNull(),
    category: badgeCategoryEnum("category").notNull(),
    icon: varchar("icon", { length: 32 }).notNull(),
    threshold: integer("threshold").default(1).notNull(),
    tier: integer("tier").default(1).notNull(),
  },
  (t) => [uniqueIndex("badges_slug_idx").on(t.slug)],
);

export const userBadges = pgTable(
  "user_badges",
  {
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    badgeId: integer("badge_id")
      .references(() => badges.id, { onDelete: "cascade" })
      .notNull(),
    earnedAt: timestamp("earned_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.badgeId] })],
);

export const karmaEvents = pgTable(
  "karma_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    base: integer("base").notNull(),
    multiplier: integer("multiplier_x100").notNull(), // stored as integer percent to avoid float drift
    amount: integer("amount").notNull(),
    reason: varchar("reason", { length: 48 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("karma_events_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Referral attribution                                                */
/* ------------------------------------------------------------------ */

export const referrals = pgTable(
  "referrals",
  {
    id: serial("id").primaryKey(),
    refUserId: integer("ref_user_id").references(() => users.id, { onDelete: "set null" }),
    shareId: varchar("share_id", { length: 32 }).notNull(),
    landingPath: varchar("landing_path", { length: 255 }).notNull(),
    visitorKey: varchar("visitor_key", { length: 64 }).notNull(),
    convertedUserId: integer("converted_user_id").references(() => users.id, { onDelete: "set null" }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("referrals_share_idx").on(t.shareId), index("referrals_visitor_idx").on(t.visitorKey)],
);

/* ------------------------------------------------------------------ */
/* Notifications & Follows                                             */
/* ------------------------------------------------------------------ */

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
    type: notificationTypeEnum("type").notNull(),
    entityType: varchar("entity_type", { length: 32 }), // 'post' | 'comment' | 'lead' | 'user'
    entityId: integer("entity_id"),
    message: text("message").notNull(),
    href: varchar("href", { length: 255 }).notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
    index("notifications_user_read_idx").on(t.userId, t.isRead),
  ],
);

export const follows = pgTable(
  "follows",
  {
    followerId: integer("follower_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    followingId: integer("following_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followingId] }),
    index("follows_follower_idx").on(t.followerId),
    index("follows_following_idx").on(t.followingId),
  ],
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  comments: many(comments),
  memberships: many(memberships),
  badges: many(userBadges),
}));

export const spacesRelations = relations(spaces, ({ many }) => ({
  posts: many(posts),
  memberships: many(memberships),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
  space: one(spaces, { fields: [posts.spaceId], references: [spaces.id] }),
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
}));

export const userBadgesRelations = relations(userBadges, ({ one }) => ({
  badge: one(badges, { fields: [userBadges.badgeId], references: [badges.id] }),
  user: one(users, { fields: [userBadges.userId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id], relationName: "userNotifications" }),
  actor: one(users, { fields: [notifications.actorId], references: [users.id], relationName: "actorNotifications" }),
}));

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(users, { fields: [follows.followerId], references: [users.id], relationName: "userFollowing" }),
  following: one(users, { fields: [follows.followingId], references: [users.id], relationName: "userFollowers" }),
}));

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Space = typeof spaces.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type LeadBid = typeof leadBids.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type Badge = typeof badges.$inferSelect;
export type UserBadge = typeof userBadges.$inferSelect;
export type Referral = typeof referrals.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];
export type Follow = typeof follows.$inferSelect;
export type NewFollow = typeof follows.$inferInsert;
export type PostKind = (typeof postKindEnum.enumValues)[number];
export type LeadKind = (typeof leadKindEnum.enumValues)[number];
export type ReportReason = (typeof reportReasonEnum.enumValues)[number];
export type ReportTarget = (typeof reportTargetEnum.enumValues)[number];
export type ReportStatus = (typeof reportStatusEnum.enumValues)[number];
export type ModAction = (typeof modActionEnum.enumValues)[number];
