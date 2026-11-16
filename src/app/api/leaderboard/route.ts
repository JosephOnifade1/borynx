import { NextRequest } from "next/server";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, follows, users } from "@/db/schema";
import { handler } from "@/lib/api";
import { getCurrentUser, toPublicUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const sort = sp.get("sort") || "karma";
  const verifiedOnly = sp.get("verified") === "1";
  const skill = sp.get("skill")?.toLowerCase().trim();
  const limit = Math.min(Number(sp.get("limit") || "40"), 100);
  const viewer = await getCurrentUser();

  const conditions = [eq(users.isBanned, false)];
  if (verifiedOnly) conditions.push(eq(users.isVerified, true));
  if (skill) {
    conditions.push(sql`${users.skills}::text ILIKE ${`%${skill}%`}`);
  }

  // Base query with counts
  const rows = await db
    .select({
      user: users,
      followerCount: sql<number>`(SELECT count(*)::int FROM ${follows} WHERE ${follows.followingId} = ${users.id})`,
      solutionCount: sql<number>`(SELECT count(*)::int FROM ${comments} WHERE ${comments.authorId} = ${users.id} AND ${comments.isSolution} = true)`,
      isFollowing: viewer
        ? sql<boolean>`EXISTS (SELECT 1 FROM ${follows} WHERE ${follows.followerId} = ${viewer.id} AND ${follows.followingId} = ${users.id})`
        : sql<boolean>`false`,
    })
    .from(users)
    .where(and(...conditions))
    .limit(limit);

  // In-memory stable rank sort according to chosen mode
  const sorted = [...rows].sort((a, b) => {
    if (sort === "solutions") return b.solutionCount - a.solutionCount;
    if (sort === "followers") return b.followerCount - a.followerCount;
    if (sort === "recent") return b.user.createdAt.getTime() - a.user.createdAt.getTime();
    return b.user.karma - a.user.karma;
  });

  const items = sorted.map((r, i) => ({
    ...toPublicUser(r.user),
    solutionCount: r.solutionCount,
    followerCount: r.followerCount,
    isFollowing: r.isFollowing,
    rank: i + 1,
  }));

  return Response.json({ items });
});
