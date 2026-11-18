import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  badges,
  comments,
  karmaEvents,
  leads,
  memberships,
  posts,
  reports,
  userBadges,
  users,
  votes,
  type Badge,
  type PostKind,
  type ReportTarget,
  type User,
} from "@/db/schema";
import { HttpError } from "./errors";
import { BADGE_DEFINITIONS, type BadgeStats } from "./badges";
import {
  karmaForCommentVote,
  karmaForLeadVote,
  karmaForPostVote,
  karmaForSolution,
  multiplierToPercent,
  type KarmaComputation,
} from "./karma";
import { evaluateContent, RATE_LIMITS, type RateLimitedAction } from "./safety";
import { createNotification } from "./notifications";
import { activePost, lockOpenPost } from "./post-access";
import { routes } from "./utils";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = typeof db | Tx;

/* ------------------------------------------------------------------ */
/* Karma                                                               */
/* ------------------------------------------------------------------ */

export async function applyKarma(exec: Executor, userId: number, computation: KarmaComputation): Promise<void> {
  if (computation.amount === 0) return;
  await exec.insert(karmaEvents).values({
    userId,
    base: computation.base,
    multiplier: multiplierToPercent(computation.multiplier),
    amount: computation.amount,
    reason: computation.reason,
  });
  await exec
    .update(users)
    .set({ karma: sql`${users.karma} + ${computation.amount}` })
    .where(eq(users.id, userId));
}

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

export async function assertRateLimit(userId: number, action: RateLimitedAction): Promise<void> {
  const limit = RATE_LIMITS[action];
  const since = new Date(Date.now() - limit.windowMinutes * 60_000);
  let recent = 0;
  switch (action) {
    case "post": {
      const [r] = await db.select({ c: count() }).from(posts).where(and(eq(posts.authorId, userId), gte(posts.createdAt, since)));
      recent = r.c;
      break;
    }
    case "comment": {
      const [r] = await db.select({ c: count() }).from(comments).where(and(eq(comments.authorId, userId), gte(comments.createdAt, since)));
      recent = r.c;
      break;
    }
    case "lead": {
      const [r] = await db.select({ c: count() }).from(leads).where(and(eq(leads.authorId, userId), gte(leads.createdAt, since)));
      recent = r.c;
      break;
    }
    case "report": {
      const [r] = await db.select({ c: count() }).from(reports).where(and(eq(reports.reporterId, userId), gte(reports.createdAt, since)));
      recent = r.c;
      break;
    }
    case "bid":
      recent = 0;
      break;
  }
  if (recent >= limit.max) {
    throw new HttpError(429, `Slow down — max ${limit.max} ${action}s per ${limit.windowMinutes} minutes.`, "rate_limited");
  }
}

/* ------------------------------------------------------------------ */
/* Automated safety                                                    */
/* ------------------------------------------------------------------ */

export function screenContent(text: string): ReturnType<typeof evaluateContent> {
  const verdict = evaluateContent(text);
  if (!verdict.allowed) {
    const reasons = verdict.flags.map((f) => f.code.replace("_", " ")).join(", ");
    throw new HttpError(422, `Submission blocked by automated filter (${reasons}).`, "filtered");
  }
  return verdict;
}

export async function fileAutoReport(
  exec: Executor,
  targetType: ReportTarget,
  targetId: number,
  spaceId: number | null,
  verdict: ReturnType<typeof evaluateContent>,
): Promise<void> {
  if (!verdict.needsReview) return;
  await exec.insert(reports).values({
    reporterId: null,
    targetType,
    targetId,
    spaceId,
    reason: "automated_filter",
    details: `Auto-filter score ${verdict.score.toFixed(2)}: ${verdict.flags.map((f) => `${f.code} (${f.detail})`).join("; ")}`,
  });
}

/* ------------------------------------------------------------------ */
/* Voting                                                              */
/* ------------------------------------------------------------------ */

export type VoteTarget = "post" | "comment" | "lead";

export interface VoteResult {
  upvotes: number;
  downvotes: number;
  userVote: number;
}

export async function castVote(user: User, targetType: VoteTarget, targetId: number, value: 1 | -1 | 0): Promise<VoteResult> {
  return db.transaction(async (tx) => {
    if (targetType === "post") await lockOpenPost(tx, targetId, user);
    if (targetType === "comment") {
      const [comment] = await tx.select({ postId: comments.postId }).from(comments)
        .where(and(eq(comments.id, targetId), eq(comments.isRemoved, false))).limit(1);
      if (!comment) throw new HttpError(404, "Comment not found");
      await lockOpenPost(tx, comment.postId, user);
    }
    const [existing] = await tx
      .select()
      .from(votes)
      .where(and(eq(votes.userId, user.id), eq(votes.targetType, targetType), eq(votes.targetId, targetId)))
      .limit(1);
    const prev = existing?.value ?? 0;
    if (prev === value) {
      const current = await readTallies(tx, targetType, targetId);
      return { ...current, userVote: prev };
    }

    if (existing) {
      if (value === 0) {
        await tx.delete(votes).where(and(eq(votes.userId, user.id), eq(votes.targetType, targetType), eq(votes.targetId, targetId)));
      } else {
        await tx
          .update(votes)
          .set({ value })
          .where(and(eq(votes.userId, user.id), eq(votes.targetType, targetType), eq(votes.targetId, targetId)));
      }
    } else if (value !== 0) {
      await tx.insert(votes).values({ userId: user.id, targetType, targetId, value });
    }

    const upDelta = (value === 1 ? 1 : 0) - (prev === 1 ? 1 : 0);
    const downDelta = (value === -1 ? 1 : 0) - (prev === -1 ? 1 : 0);
    const netDelta = value - prev;

    let authorId: number | null = null;
    let kind: PostKind = "discussion";

    if (targetType === "post") {
      const [row] = await tx
        .update(posts)
        .set({ upvotes: sql`${posts.upvotes} + ${upDelta}`, downvotes: sql`${posts.downvotes} + ${downDelta}` })
        .where(eq(posts.id, targetId))
        .returning({ authorId: posts.authorId, kind: posts.kind });
      if (!row) throw new HttpError(404, "Post not found");
      authorId = row.authorId;
      kind = row.kind;
    } else if (targetType === "comment") {
      const [row] = await tx
        .update(comments)
        .set({ upvotes: sql`${comments.upvotes} + ${upDelta}`, downvotes: sql`${comments.downvotes} + ${downDelta}` })
        .where(eq(comments.id, targetId))
        .returning({ authorId: comments.authorId });
      if (!row) throw new HttpError(404, "Comment not found");
      authorId = row.authorId;
    } else {
      const [row] = await tx
        .update(leads)
        .set({ upvotes: sql`${leads.upvotes} + ${upDelta}`, downvotes: sql`${leads.downvotes} + ${downDelta}` })
        .where(eq(leads.id, targetId))
        .returning({ authorId: leads.authorId });
      if (!row) throw new HttpError(404, "Lead not found");
      authorId = row.authorId;
    }

    if (authorId && authorId !== user.id) {
      const computation =
        targetType === "post" ? karmaForPostVote(kind, netDelta) : targetType === "comment" ? karmaForCommentVote(netDelta) : karmaForLeadVote(netDelta);
      await applyKarma(tx, authorId, computation);
      await evaluateBadges(authorId, tx);
    }

    const tallies = await readTallies(tx, targetType, targetId);
    return { ...tallies, userVote: value };
  });
}

async function readTallies(exec: Executor, targetType: VoteTarget, targetId: number): Promise<{ upvotes: number; downvotes: number }> {
  const table = targetType === "post" ? posts : targetType === "comment" ? comments : leads;
  const [row] = await exec.select({ upvotes: table.upvotes, downvotes: table.downvotes }).from(table).where(eq(table.id, targetId)).limit(1);
  return row ?? { upvotes: 0, downvotes: 0 };
}

/* ------------------------------------------------------------------ */
/* Solutions                                                           */
/* ------------------------------------------------------------------ */

export async function markSolution(commentId: number, actor: User): Promise<{ isSolution: boolean }> {
  return db.transaction(async (tx) => {
    const [target] = await tx.select({ postId: comments.postId }).from(comments).where(eq(comments.id, commentId)).limit(1);
    if (!target) throw new HttpError(404, "Comment not found");
    const { post, spaceSlug } = await lockOpenPost(tx, target.postId, actor);
    const [comment] = await tx.select().from(comments).where(and(eq(comments.id, commentId), eq(comments.isRemoved, false))).limit(1);
    if (!comment) throw new HttpError(404, "Comment not found");
    const staff = actor.role === "admin" || actor.role === "moderator";
    if (post.authorId !== actor.id && !staff) throw new HttpError(403, "Only the thread author can accept a solution");

    if (comment.isSolution) {
      await tx.update(comments).set({ isSolution: false }).where(eq(comments.id, commentId));
      await tx.update(posts).set({ isSolved: false, solutionCommentId: null }).where(eq(posts.id, post.id));
      await applyKarma(tx, comment.authorId, karmaForSolution(true));
      return { isSolution: false };
    }

    if (post.solutionCommentId) {
      const [prev] = await tx.select().from(comments).where(eq(comments.id, post.solutionCommentId)).limit(1);
      await tx.update(comments).set({ isSolution: false }).where(eq(comments.id, post.solutionCommentId));
      if (prev) await applyKarma(tx, prev.authorId, karmaForSolution(true));
    }
    await tx.update(comments).set({ isSolution: true }).where(eq(comments.id, commentId));
    await tx.update(posts).set({ isSolved: true, solutionCommentId: commentId }).where(eq(posts.id, post.id));
    const karmaGain = karmaForSolution(false);
    await applyKarma(tx, comment.authorId, karmaGain);
    await evaluateBadges(comment.authorId, tx);

    if (comment.authorId !== actor.id) {
      await createNotification(
        {
          userId: comment.authorId,
          actorId: actor.id,
          type: "solution_accepted",
          entityType: "post",
          entityId: post.id,
          message: `${actor.displayName} accepted your solution on "${post.title}" (+${karmaGain.amount} karma)`,
          href: routes.post(spaceSlug, post.id, post.slug),
        },
        tx,
      );
    }

    return { isSolution: true };
  });
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

export async function loadBadgeStats(userId: number, exec: Executor = db): Promise<BadgeStats> {
  const [user] = await exec.select({ karma: users.karma, isVerified: users.isVerified }).from(users).where(eq(users.id, userId)).limit(1);
  const [p] = await exec.select({ c: count() }).from(posts).where(and(eq(posts.authorId, userId), activePost));
  const [ep] = await exec
    .select({ c: count() })
    .from(posts)
    .where(and(eq(posts.authorId, userId), activePost, sql`${posts.upvotes} - ${posts.downvotes} >= 5`));
  const [s] = await exec.select({ c: count() }).from(comments).where(and(eq(comments.authorId, userId), eq(comments.isSolution, true)));
  const [c] = await exec.select({ c: count() }).from(comments).where(and(eq(comments.authorId, userId), eq(comments.isRemoved, false)));
  const [l] = await exec.select({ c: count() }).from(leads).where(and(eq(leads.authorId, userId), eq(leads.isRemoved, false)));
  const [m] = await exec.select({ c: count() }).from(memberships).where(eq(memberships.userId, userId));
  return {
    verified: user?.isVerified ? 1 : 0,
    karma: user?.karma ?? 0,
    posts: p.c,
    engaged_posts: ep.c,
    solutions: s.c,
    comments: c.c,
    leads: l.c,
    memberships: m.c,
  };
}

/** Evaluates all badge thresholds for a user and inserts newly unlocked ones. Returns new badges. */
export async function evaluateBadges(userId: number, exec: Executor = db): Promise<Badge[]> {
  const stats = await loadBadgeStats(userId, exec);
  const unlockedSlugs = BADGE_DEFINITIONS.filter((d) => stats[d.metric] >= d.threshold).map((d) => d.slug);
  if (unlockedSlugs.length === 0) return [];
  const catalogue = await exec.select().from(badges).where(inArray(badges.slug, unlockedSlugs));
  const owned = await exec.select({ badgeId: userBadges.badgeId }).from(userBadges).where(eq(userBadges.userId, userId));
  const ownedIds = new Set(owned.map((o) => o.badgeId));
  const fresh = catalogue.filter((b) => !ownedIds.has(b.id));
  if (fresh.length === 0) return [];
  await exec
    .insert(userBadges)
    .values(fresh.map((b) => ({ userId, badgeId: b.id })))
    .onConflictDoNothing();
  return fresh;
}

export async function getUserBadges(userId: number): Promise<Array<Badge & { earnedAt: Date }>> {
  const rows = await db
    .select({ badge: badges, earnedAt: userBadges.earnedAt })
    .from(userBadges)
    .innerJoin(badges, eq(badges.id, userBadges.badgeId))
    .where(eq(userBadges.userId, userId))
    .orderBy(desc(badges.tier), desc(userBadges.earnedAt));
  return rows.map((r) => ({ ...r.badge, earnedAt: r.earnedAt }));
}
