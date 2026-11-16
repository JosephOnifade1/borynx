import { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { memberships, spaces } from "@/db/schema";
import { handler } from "@/lib/api";
import { HttpError, requireActor } from "@/lib/auth";
import { resolveSpace } from "@/lib/queries";
import { evaluateBadges } from "@/lib/services";

export const dynamic = "force-dynamic";

export const POST = handler(async (_req: NextRequest, { params }) => {
  const actor = await requireActor();
  const resolved = await resolveSpace(params.slug);
  if (!resolved) throw new HttpError(404, "Space not found", "not_found");
  const space = resolved.space;
  if (space.privacy === "private" && actor.role === "member") throw new HttpError(403, "This space is invite-only", "forbidden");

  const [existing] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, actor.id), eq(memberships.spaceId, space.id)))
    .limit(1);

  if (existing) {
    if (existing.modRole === "owner") throw new HttpError(400, "Owners cannot leave their space");
    await db.delete(memberships).where(and(eq(memberships.userId, actor.id), eq(memberships.spaceId, space.id)));
    await db.update(spaces).set({ memberCount: sql`greatest(${spaces.memberCount} - 1, 0)` }).where(eq(spaces.id, space.id));
    return Response.json({ joined: false });
  }
  await db.insert(memberships).values({ userId: actor.id, spaceId: space.id }).onConflictDoNothing();
  await db.update(spaces).set({ memberCount: sql`${spaces.memberCount} + 1` }).where(eq(spaces.id, space.id));
  await evaluateBadges(actor.id);
  return Response.json({ joined: true });
});
