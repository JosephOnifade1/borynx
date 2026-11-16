import { NextRequest } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, follows, posts } from "@/db/schema";
import { handler } from "@/lib/api";
import { getCurrentUser, HttpError, toPublicUser } from "@/lib/auth";
import { resolveUser } from "@/lib/queries";
import { getUserBadges } from "@/lib/services";
import type { HoverCardUser } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Hover-card payload: public profile + badges + live counters. */
export const GET = handler(async (_req: NextRequest, { params }) => {
  const resolved = await resolveUser(params.username);
  if (!resolved) throw new HttpError(404, "User not found", "not_found");
  const { user } = resolved;
  const viewer = await getCurrentUser();

  const [badgeRows, [p], [s], [f], isFollowingRow] = await Promise.all([
    getUserBadges(user.id),
    db.select({ c: count() }).from(posts).where(and(eq(posts.authorId, user.id), eq(posts.isRemoved, false))),
    db.select({ c: count() }).from(comments).where(and(eq(comments.authorId, user.id), eq(comments.isSolution, true))),
    db.select({ c: count() }).from(follows).where(eq(follows.followingId, user.id)),
    viewer
      ? db
          .select({ followerId: follows.followerId })
          .from(follows)
          .where(and(eq(follows.followerId, viewer.id), eq(follows.followingId, user.id)))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const payload: HoverCardUser = {
    ...toPublicUser(user),
    badges: badgeRows.slice(0, 4).map((b) => ({ slug: b.slug, name: b.name, icon: b.icon, tier: b.tier })),
    postCount: p.c,
    solutionCount: s.c,
    followerCount: f.c,
    isFollowing: isFollowingRow.length > 0,
  };
  return Response.json(payload, { headers: { "Cache-Control": "private, max-age=15" } });
});
