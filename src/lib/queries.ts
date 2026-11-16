import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, follows, leads, posts, saves, spaceAliases, spaces, userAliases, users, votes, type Space, type User } from "@/db/schema";
import { rankItems, type RankMode } from "./sorting";
import type { AuthorSummary, CommentNode, FeedLead, FeedPage, FeedPost, SearchResult } from "./types";
import { routes } from "./utils";

export const FEED_WINDOW = 400;
export const PAGE_SIZE = 25;

const authorCols = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  avatarHue: users.avatarHue,
  isVerified: users.isVerified,
  karma: users.karma,
};

const excerpt = (body: string, n: number = 180): string => {
  const flat = body.replace(/```[\s\S]*?```/g, "").replace(/[#*`>|_-]+/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n - 1).trimEnd()}…` : flat;
};

/* ------------------------------------------------------------------ */
/* Resolution (canonical + legacy)                                     */
/* ------------------------------------------------------------------ */

export async function resolveSpace(slugOrAlias: string): Promise<{ space: Space; canonical: boolean } | null> {
  const slug = slugOrAlias.toLowerCase();
  const [direct] = await db.select().from(spaces).where(eq(spaces.slug, slug)).limit(1);
  if (direct) return { space: direct, canonical: slug === slugOrAlias };
  const [alias] = await db
    .select({ space: spaces })
    .from(spaceAliases)
    .innerJoin(spaces, eq(spaces.id, spaceAliases.spaceId))
    .where(eq(spaceAliases.alias, slug))
    .limit(1);
  return alias ? { space: alias.space, canonical: false } : null;
}

export async function resolveUser(usernameOrAlias: string): Promise<{ user: User; canonical: boolean } | null> {
  const name = usernameOrAlias.toLowerCase();
  const [direct] = await db.select().from(users).where(eq(users.username, name)).limit(1);
  if (direct) return { user: direct, canonical: name === usernameOrAlias };
  const [alias] = await db
    .select({ user: users })
    .from(userAliases)
    .innerJoin(users, eq(users.id, userAliases.userId))
    .where(eq(userAliases.alias, name))
    .limit(1);
  return alias ? { user: alias.user, canonical: false } : null;
}

/* ------------------------------------------------------------------ */
/* Posts                                                               */
/* ------------------------------------------------------------------ */

async function viewerPostState(viewerId: number | null, postIds: number[]): Promise<{ votes: Map<number, number>; saved: Set<number> }> {
  const voteMap = new Map<number, number>();
  const savedSet = new Set<number>();
  if (!viewerId || postIds.length === 0) return { votes: voteMap, saved: savedSet };
  const [vs, ss] = await Promise.all([
    db
      .select({ targetId: votes.targetId, value: votes.value })
      .from(votes)
      .where(and(eq(votes.userId, viewerId), eq(votes.targetType, "post"), inArray(votes.targetId, postIds))),
    db.select({ postId: saves.postId }).from(saves).where(and(eq(saves.userId, viewerId), inArray(saves.postId, postIds))),
  ]);
  for (const v of vs) voteMap.set(v.targetId, v.value);
  for (const s of ss) savedSet.add(s.postId);
  return { votes: voteMap, saved: savedSet };
}

/** First external URL in a markdown body (used for link preview chips). */
export function firstExternalLink(body: string): string | null {
  const m = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/.exec(body);
  return m ? m[0] : null;
}

export interface ListPostsOptions {
  mode: RankMode;
  spaceId?: number;
  authorId?: number;
  savedBy?: number;
  followingUserId?: number;
  solvedOnly?: boolean;
  cursor?: number;
  viewerId: number | null;
  limit?: number;
}

export async function listPosts(opts: ListPostsOptions): Promise<FeedPage<FeedPost>> {
  const limit = opts.limit ?? PAGE_SIZE;
  const conditions = [eq(posts.isRemoved, false)];
  if (opts.spaceId) conditions.push(eq(posts.spaceId, opts.spaceId));
  if (opts.authorId) conditions.push(eq(posts.authorId, opts.authorId));
  if (opts.solvedOnly) conditions.push(eq(posts.isSolved, true));

  let base = db
    .select({ post: posts, author: authorCols, space: { id: spaces.id, slug: spaces.slug, name: spaces.name, accentHue: spaces.accentHue } })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .innerJoin(spaces, eq(spaces.id, posts.spaceId))
    .$dynamic();
  if (opts.savedBy) base = base.innerJoin(saves, and(eq(saves.postId, posts.id), eq(saves.userId, opts.savedBy)));
  if (opts.followingUserId) base = base.innerJoin(follows, and(eq(follows.followingId, posts.authorId), eq(follows.followerId, opts.followingUserId)));

  const rows = await base.where(and(...conditions)).orderBy(desc(posts.createdAt)).limit(FEED_WINDOW);
  const ranked = rankItems(
    rows.map((r) => ({ ...r, upvotes: r.post.upvotes, downvotes: r.post.downvotes, commentCount: r.post.commentCount, createdAt: r.post.createdAt })),
    opts.mode,
  );
  const pinnedFirst = [...ranked].sort((a, b) => Number(b.post.isPinned) - Number(a.post.isPinned));
  const start = opts.cursor ?? 0;
  const slice = pinnedFirst.slice(start, start + limit);
  const state = await viewerPostState(opts.viewerId, slice.map((r) => r.post.id));

  return {
    mode: opts.mode,
    total: pinnedFirst.length,
    nextCursor: start + limit < pinnedFirst.length ? start + limit : null,
    items: slice.map(({ post, author, space }) => ({
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: excerpt(post.body),
      kind: post.kind,
      upvotes: post.upvotes,
      downvotes: post.downvotes,
      commentCount: post.commentCount,
      isSolved: post.isSolved,
      isPinned: post.isPinned,
      createdAt: post.createdAt.toISOString(),
      author,
      space,
      userVote: state.votes.get(post.id) ?? 0,
      saved: state.saved.has(post.id),
      primaryLink: firstExternalLink(post.body),
      href: routes.post(space.slug, post.id, post.slug),
    })),
  };
}

export async function getPostById(id: number) {
  const [row] = await db
    .select({ post: posts, author: authorCols, space: spaces })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .innerJoin(spaces, eq(spaces.id, posts.spaceId))
    .where(eq(posts.id, id))
    .limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */

export async function listComments(postId: number, viewerId: number | null): Promise<CommentNode[]> {
  const rows = await db
    .select({ comment: comments, author: authorCols })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.postId, postId))
    .orderBy(desc(comments.isSolution), desc(sql`${comments.upvotes} - ${comments.downvotes}`), comments.createdAt);

  const voteMap = new Map<number, number>();
  if (viewerId && rows.length) {
    const vs = await db
      .select({ targetId: votes.targetId, value: votes.value })
      .from(votes)
      .where(and(eq(votes.userId, viewerId), eq(votes.targetType, "comment"), inArray(votes.targetId, rows.map((r) => r.comment.id))));
    for (const v of vs) voteMap.set(v.targetId, v.value);
  }

  // Flatten into a depth-first thread so it can be virtualised as a flat list.
  const byParent = new Map<number | null, typeof rows>();
  for (const r of rows) {
    const key = r.comment.parentId ?? null;
    const bucket = byParent.get(key) ?? [];
    bucket.push(r);
    byParent.set(key, bucket);
  }
  const out: CommentNode[] = [];
  const walk = (parentId: number | null, depth: number) => {
    for (const r of byParent.get(parentId) ?? []) {
      out.push({
        id: r.comment.id,
        postId: r.comment.postId,
        parentId: r.comment.parentId,
        depth,
        body: r.comment.isRemoved ? "[removed by moderator]" : r.comment.body,
        upvotes: r.comment.upvotes,
        downvotes: r.comment.downvotes,
        isSolution: r.comment.isSolution,
        isRemoved: r.comment.isRemoved,
        createdAt: r.comment.createdAt.toISOString(),
        author: r.author,
        userVote: voteMap.get(r.comment.id) ?? 0,
      });
      walk(r.comment.id, Math.min(depth + 1, 6));
    }
  };
  walk(null, 0);
  return out;
}

/* ------------------------------------------------------------------ */
/* Leads                                                               */
/* ------------------------------------------------------------------ */

export interface ListLeadsOptions {
  mode: RankMode;
  category?: string;
  kind?: string;
  verifiedOnly?: boolean;
  authorId?: number;
  cursor?: number;
  viewerId: number | null;
  limit?: number;
}

export async function listLeads(opts: ListLeadsOptions): Promise<FeedPage<FeedLead>> {
  const limit = opts.limit ?? PAGE_SIZE;
  const conditions = [eq(leads.isRemoved, false)];
  if (opts.category) conditions.push(eq(leads.category, opts.category));
  if (opts.kind === "bounty" || opts.kind === "contract" || opts.kind === "job") conditions.push(eq(leads.kind, opts.kind));
  if (opts.verifiedOnly) conditions.push(eq(leads.isVerified, true));
  if (opts.authorId) conditions.push(eq(leads.authorId, opts.authorId));

  const rows = await db
    .select({ lead: leads, author: authorCols, space: { id: spaces.id, slug: spaces.slug, name: spaces.name, accentHue: spaces.accentHue } })
    .from(leads)
    .innerJoin(users, eq(users.id, leads.authorId))
    .leftJoin(spaces, eq(spaces.id, leads.spaceId))
    .where(and(...conditions))
    .orderBy(desc(leads.createdAt))
    .limit(FEED_WINDOW);

  const ranked = rankItems(
    rows.map((r) => ({ ...r, upvotes: r.lead.upvotes, downvotes: r.lead.downvotes, commentCount: r.lead.bidCount, createdAt: r.lead.createdAt })),
    opts.mode,
  );
  const start = opts.cursor ?? 0;
  const slice = ranked.slice(start, start + limit);
  const voteMap = new Map<number, number>();
  if (opts.viewerId && slice.length) {
    const vs = await db
      .select({ targetId: votes.targetId, value: votes.value })
      .from(votes)
      .where(and(eq(votes.userId, opts.viewerId), eq(votes.targetType, "lead"), inArray(votes.targetId, slice.map((r) => r.lead.id))));
    for (const v of vs) voteMap.set(v.targetId, v.value);
  }
  return {
    mode: opts.mode,
    total: ranked.length,
    nextCursor: start + limit < ranked.length ? start + limit : null,
    items: slice.map(({ lead, author, space }) => ({
      id: lead.id,
      slug: lead.slug,
      title: lead.title,
      excerpt: excerpt(lead.description, 200),
      category: lead.category,
      kind: lead.kind,
      budgetMin: lead.budgetMin,
      budgetMax: lead.budgetMax,
      currency: lead.currency,
      location: lead.location,
      isVerified: lead.isVerified,
      isEscrowed: lead.isEscrowed,
      status: lead.status,
      upvotes: lead.upvotes,
      downvotes: lead.downvotes,
      bidCount: lead.bidCount,
      createdAt: lead.createdAt.toISOString(),
      author,
      space: space && space.id !== null ? (space as FeedLead["space"]) : null,
      userVote: voteMap.get(lead.id) ?? 0,
      href: routes.lead(lead.id, lead.slug),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export async function searchAll(q: string): Promise<SearchResult[]> {
  const term = `%${q.trim()}%`;
  if (q.trim().length < 1) return [];
  const [sp, us, ld, ps] = await Promise.all([
    db.select({ id: spaces.id, slug: spaces.slug, name: spaces.name, tagline: spaces.tagline }).from(spaces).where(or(ilike(spaces.slug, term), ilike(spaces.name, term))).limit(5),
    db.select({ id: users.id, username: users.username, displayName: users.displayName, headline: users.headline }).from(users).where(and(eq(users.isBanned, false), or(ilike(users.username, term), ilike(users.displayName, term)))).limit(5),
    db.select({ id: leads.id, slug: leads.slug, title: leads.title, category: leads.category }).from(leads).where(and(eq(leads.isRemoved, false), ilike(leads.title, term))).limit(5),
    db.select({ id: posts.id, slug: posts.slug, title: posts.title, spaceSlug: spaces.slug }).from(posts).innerJoin(spaces, eq(spaces.id, posts.spaceId)).where(and(eq(posts.isRemoved, false), ilike(posts.title, term))).limit(5),
  ]);
  return [
    ...sp.map((s): SearchResult => ({ type: "space", id: s.id, title: `b/${s.slug}`, subtitle: s.name, href: routes.space(s.slug) })),
    ...us.map((u): SearchResult => ({ type: "user", id: u.id, title: `f/${u.username}`, subtitle: u.displayName, href: routes.profile(u.username) })),
    ...ld.map((l): SearchResult => ({ type: "lead", id: l.id, title: l.title, subtitle: `Lead · ${l.category}`, href: routes.lead(l.id, l.slug) })),
    ...ps.map((p): SearchResult => ({ type: "post", id: p.id, title: p.title, subtitle: `b/${p.spaceSlug}`, href: routes.post(p.spaceSlug, p.id, p.slug) })),
  ];
}

export type { AuthorSummary };
