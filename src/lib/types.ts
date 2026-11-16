import type { Badge, Lead, LeadKind, Post, PostKind, Space } from "@/db/schema";
import type { PublicUser } from "./auth";
import type { RankMode } from "./sorting";

export interface AuthorSummary {
  id: number;
  username: string;
  displayName: string;
  avatarHue: number;
  isVerified: boolean;
  karma: number;
}

export interface SpaceSummary {
  id: number;
  slug: string;
  name: string;
  accentHue: number;
}

export interface FeedPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  kind: PostKind;
  upvotes: number;
  downvotes: number;
  commentCount: number;
  isSolved: boolean;
  isPinned: boolean;
  createdAt: string;
  author: AuthorSummary;
  space: SpaceSummary;
  userVote: number;
  saved: boolean;
  /** First external URL in the body, rendered as a link preview chip. */
  primaryLink: string | null;
  href: string;
}

export interface FeedPage<T> {
  items: T[];
  nextCursor: number | null;
  mode: RankMode;
  total: number;
}

export interface FeedLead {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  kind: LeadKind;
  budgetMin: number;
  budgetMax: number;
  currency: string;
  location: string;
  isVerified: boolean;
  isEscrowed: boolean;
  status: Lead["status"];
  upvotes: number;
  downvotes: number;
  bidCount: number;
  createdAt: string;
  author: AuthorSummary;
  space: SpaceSummary | null;
  userVote: number;
  href: string;
}

export interface CommentNode {
  id: number;
  postId: number;
  parentId: number | null;
  depth: number;
  body: string;
  upvotes: number;
  downvotes: number;
  isSolution: boolean;
  isRemoved: boolean;
  createdAt: string;
  author: AuthorSummary;
  userVote: number;
}

export interface HoverCardUser extends PublicUser {
  badges: Array<Pick<Badge, "slug" | "name" | "icon" | "tier">>;
  postCount: number;
  solutionCount: number;
  followerCount?: number;
  followingCount?: number;
  isFollowing?: boolean;
}

export interface SearchResult {
  type: "space" | "user" | "lead" | "post";
  id: number;
  title: string;
  subtitle: string;
  href: string;
}

export interface ApiError {
  error: string;
  code: string;
}

export type PostWithRelations = Post & { author: AuthorSummary; space: Pick<Space, "id" | "slug" | "name" | "accentHue"> };
