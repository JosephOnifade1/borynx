import { NextRequest } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { follows } from "@/db/schema";
import { handler } from "@/lib/api";
import { getCurrentUser, HttpError, requireActor } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { resolveUser } from "@/lib/queries";
import { routes } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req: NextRequest, { params }) => {
  const resolved = await resolveUser(params.username);
  if (!resolved) throw new HttpError(404, "User not found", "not_found");
  const target = resolved.user;

  const viewer = await getCurrentUser();
  const [[followerRow], [followingRow], isFollowingRow] = await Promise.all([
    db.select({ c: count() }).from(follows).where(eq(follows.followingId, target.id)),
    db.select({ c: count() }).from(follows).where(eq(follows.followerId, target.id)),
    viewer
      ? db
          .select({ followerId: follows.followerId })
          .from(follows)
          .where(and(eq(follows.followerId, viewer.id), eq(follows.followingId, target.id)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  return Response.json({
    following: isFollowingRow.length > 0,
    followerCount: followerRow.c,
    followingCount: followingRow.c,
  });
});

export const POST = handler(async (_req: NextRequest, { params }) => {
  const actor = await requireActor();
  const resolved = await resolveUser(params.username);
  if (!resolved) throw new HttpError(404, "User not found", "not_found");
  const target = resolved.user;

  if (actor.id === target.id) {
    throw new HttpError(400, "You cannot follow yourself", "bad_request");
  }

  const [existing] = await db
    .select()
    .from(follows)
    .where(and(eq(follows.followerId, actor.id), eq(follows.followingId, target.id)))
    .limit(1);

  let following = false;
  if (existing) {
    await db
      .delete(follows)
      .where(and(eq(follows.followerId, actor.id), eq(follows.followingId, target.id)));
    following = false;
  } else {
    await db.insert(follows).values({
      followerId: actor.id,
      followingId: target.id,
    });
    following = true;

    await createNotification({
      userId: target.id,
      actorId: actor.id,
      type: "user_follow",
      entityType: "user",
      entityId: actor.id,
      message: `${actor.displayName} started following you`,
      href: routes.profile(actor.username),
    });
  }

  const [followerRow] = await db
    .select({ c: count() })
    .from(follows)
    .where(eq(follows.followingId, target.id));

  return Response.json({
    following,
    followerCount: followerRow.c,
  });
});
