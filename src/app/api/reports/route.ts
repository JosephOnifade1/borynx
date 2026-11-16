import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, leads, posts, reportReasonEnum, reports, reportTargetEnum } from "@/db/schema";
import { handler, oneOf, readJson } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth";
import { assertRateLimit } from "@/lib/services";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await readJson<{ targetType?: string; targetId?: number; reason?: string; details?: string }>(req);
  const targetType = oneOf(body.targetType, reportTargetEnum.enumValues, "targetType");
  const reason = oneOf(body.reason, reportReasonEnum.enumValues.filter((r) => r !== "automated_filter"), "reason");
  const targetId = Number(body.targetId);
  if (!Number.isInteger(targetId)) throw new HttpError(400, "Invalid target");
  const details = typeof body.details === "string" ? body.details.trim().slice(0, 1000) : "";

  await assertRateLimit(user.id, "report");

  let spaceId: number | null = null;
  if (targetType === "post") {
    const [p] = await db.select({ spaceId: posts.spaceId }).from(posts).where(eq(posts.id, targetId)).limit(1);
    if (!p) throw new HttpError(404, "Post not found");
    spaceId = p.spaceId;
  } else if (targetType === "comment") {
    const [c] = await db.select({ spaceId: posts.spaceId }).from(comments).innerJoin(posts, eq(posts.id, comments.postId)).where(eq(comments.id, targetId)).limit(1);
    if (!c) throw new HttpError(404, "Comment not found");
    spaceId = c.spaceId;
  } else {
    const [l] = await db.select({ spaceId: leads.spaceId }).from(leads).where(eq(leads.id, targetId)).limit(1);
    if (!l) throw new HttpError(404, "Lead not found");
    spaceId = l.spaceId;
  }

  const [created] = await db.insert(reports).values({ reporterId: user.id, targetType, targetId, spaceId, reason, details }).returning({ id: reports.id });
  return Response.json({ id: created.id }, { status: 201 });
});
