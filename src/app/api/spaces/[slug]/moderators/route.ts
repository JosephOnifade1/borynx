import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships } from "@/db/schema";
import { handler, readJson, str } from "@/lib/api";
import { canModerateSpace, HttpError, requireUser } from "@/lib/auth";
import { resolveSpace, resolveUser } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** POST { username, remove?: boolean } — promote/demote a space moderator. */
export const POST = handler(async (req: NextRequest, { params }) => {
  const actor = await requireUser();
  const resolved = await resolveSpace(params.slug);
  if (!resolved) throw new HttpError(404, "Space not found");
  if (!(await canModerateSpace(actor, resolved.space.id))) throw new HttpError(403, "You don't moderate this space", "forbidden");

  const body = await readJson<{ username?: string; remove?: boolean }>(req);
  const target = await resolveUser(str(body.username, "username"));
  if (!target) throw new HttpError(404, "User not found");
  if (target.user.isBanned) throw new HttpError(400, "Banned users cannot moderate");

  const where = and(eq(memberships.userId, target.user.id), eq(memberships.spaceId, resolved.space.id));
  const [existing] = await db.select().from(memberships).where(where).limit(1);
  if (body.remove) {
    if (existing?.modRole === "owner") throw new HttpError(400, "Owners cannot be demoted");
    if (existing) await db.update(memberships).set({ modRole: null }).where(where);
    return Response.json({ ok: true, modRole: null });
  }
  if (existing) {
    if (existing.modRole === "owner") return Response.json({ ok: true, modRole: "owner" });
    await db.update(memberships).set({ modRole: "moderator" }).where(where);
  } else {
    await db.insert(memberships).values({ userId: target.user.id, spaceId: resolved.space.id, modRole: "moderator" });
  }
  return Response.json({ ok: true, modRole: "moderator" });
});
