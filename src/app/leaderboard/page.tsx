import { desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { comments, follows, users } from "@/db/schema";
import { LeaderboardView, type LeaderboardUser } from "@/components/leaderboard/LeaderboardView";
import { PageFrame, PageHeader } from "@/components/PageFrame";
import { getCurrentUser, toPublicUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Leaderboard — Borynx",
  description: "Top tech freelancers ranked by reputation karma, accepted solutions, and community trust.",
};

export default async function LeaderboardPage() {
  const viewer = await getCurrentUser();

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
    .where(eq(users.isBanned, false))
    .orderBy(desc(users.karma))
    .limit(40);

  const initialItems: LeaderboardUser[] = rows.map((r, i) => ({
    ...toPublicUser(r.user),
    solutionCount: r.solutionCount,
    followerCount: r.followerCount,
    isFollowing: r.isFollowing,
    rank: i + 1,
  }));

  return (
    <PageFrame
      stream
      header={
        <PageHeader
          eyebrow="Network Directory"
          title="Practitioner Leaderboard"
          description="Top tech freelancers ranked by outcome-driven reputation karma, verified badges, and accepted solutions."
        />
      }
    >
      <LeaderboardView initialItems={initialItems} />
    </PageFrame>
  );
}
