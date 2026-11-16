import type { badgeCategoryEnum } from "@/db/schema";

export type BadgeCategory = (typeof badgeCategoryEnum.enumValues)[number];

export type BadgeMetric =
  | "verified"
  | "posts"
  | "engaged_posts"
  | "karma"
  | "solutions"
  | "leads"
  | "memberships"
  | "comments";

export interface BadgeDefinition {
  slug: string;
  name: string;
  description: string;
  category: BadgeCategory;
  icon: string;
  metric: BadgeMetric;
  threshold: number;
  tier: number;
}

/** Canonical badge catalogue — seeded into `badges` and used by the achievements dashboard. */
export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    slug: "verified-pro",
    name: "Verified Pro",
    description: "Identity confirmed via GitHub OAuth or moderator vetting.",
    category: "identity",
    icon: "shield-check",
    metric: "verified",
    threshold: 1,
    tier: 3,
  },
  {
    slug: "first-post",
    name: "First Post",
    description: "Published your first thread in a space.",
    category: "milestone",
    icon: "pen-line",
    metric: "posts",
    threshold: 1,
    tier: 1,
  },
  {
    slug: "rising-voice",
    name: "Rising Voice",
    description: "10 posts that each reached 5+ net upvotes.",
    category: "milestone",
    icon: "trending-up",
    metric: "engaged_posts",
    threshold: 10,
    tier: 2,
  },
  {
    slug: "trusted-voice",
    name: "Trusted Voice",
    description: "Crossed 500 karma.",
    category: "milestone",
    icon: "award",
    metric: "karma",
    threshold: 500,
    tier: 3,
  },
  {
    slug: "top-solver",
    name: "Top Solver",
    description: "5 comments accepted as the solution.",
    category: "milestone",
    icon: "check-check",
    metric: "solutions",
    threshold: 5,
    tier: 3,
  },
  {
    slug: "first-solve",
    name: "First Solve",
    description: "Your comment was marked as a solution.",
    category: "milestone",
    icon: "check",
    metric: "solutions",
    threshold: 1,
    tier: 1,
  },
  {
    slug: "deal-maker",
    name: "Deal Maker",
    description: "Posted 3 leads to the marketplace.",
    category: "marketplace",
    icon: "briefcase",
    metric: "leads",
    threshold: 3,
    tier: 2,
  },
  {
    slug: "networker",
    name: "Networker",
    description: "Joined 5 niche spaces.",
    category: "community",
    icon: "network",
    metric: "memberships",
    threshold: 5,
    tier: 1,
  },
  {
    slug: "conversationalist",
    name: "Conversationalist",
    description: "Left 25 comments.",
    category: "community",
    icon: "messages-square",
    metric: "comments",
    threshold: 25,
    tier: 2,
  },
];

export type BadgeStats = Record<BadgeMetric, number>;

export function badgeProgress(def: BadgeDefinition, stats: BadgeStats): { current: number; pct: number; unlocked: boolean } {
  const current = stats[def.metric];
  const pct = Math.max(0, Math.min(100, Math.round((current / def.threshold) * 100)));
  return { current, pct, unlocked: current >= def.threshold };
}

export const PRIMARY_BADGE_ORDER = ["verified-pro", "top-solver", "trusted-voice", "rising-voice", "deal-maker", "first-solve", "first-post"];
