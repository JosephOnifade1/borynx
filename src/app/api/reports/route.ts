import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, posts, reportReasonEnum, reports, reportTargetEnum, spaces } from "@/db/schema";
import { assertSameOrigin, handler, oneOf, privateJson, readJson } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth";
import { lockLead, publicLead } from "@/lib/lead-access";
import { lockLeadReview } from "@/lib/lead-reviews";
import { lockOpenPost, postSpaceAccess } from "@/lib/post-access";
import { assertRateLimit } from "@/lib/services";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await readJson<{ targetType?: string; targetId?: number; reason?: string; details?: string }>(req);
  const targetType = oneOf(body?.targetType, reportTargetEnum.enumValues, "targetType");
  if (targetType === "lead_review") assertSameOrigin(req);
  const reason = oneOf(body.reason, reportReasonEnum.enumValues.filter((r) => r !== "automated_filter"), "reason");
  const targetId = Number(body.targetId);
  if (!Number.isInteger(targetId) || targetId < 1 || targetId > 2_147_483_647) throw new HttpError(400, "Invalid target");
  const details = typeof body.details === "string" ? body.details.trim().slice(0, 1000) : "";

  if (targetType === "lead_review" && details.includes("\0")) throw new HttpError(422, "Report context contains an unsupported character.", "invalid_report");

  await assertRateLimit(user.id, "report");

  return db.transaction(async (tx) => {
    let spaceId: number | null = null;
    if (targetType === "post") {
      const { post } = await lockOpenPost(tx, targetId, user);
      spaceId = post.spaceId;
    } else if (targetType === "comment") {
      const [c] = await tx.select({ spaceId: posts.spaceId }).from(comments)
        .innerJoin(posts, eq(posts.id, comments.postId))
        .innerJoin(spaces, eq(spaces.id, posts.spaceId))
        .where(and(eq(comments.id, targetId), eq(comments.isRemoved, false), eq(posts.isRemoved, false), postSpaceAccess(user))).limit(1);
      if (!c) throw new HttpError(404, "Comment not found");
      spaceId = c.spaceId;
    } else if (targetType === "lead") {
      const lead = await lockLead(tx, targetId, publicLead);
      spaceId = lead.spaceId;
    } else if (targetType === "lead_review") {
      if (!(await lockLeadReview(tx, targetId, true))) throw new HttpError(404, "Review not found", "not_found");
      // A profile review is a site-wide case, not a report on the lead or its space.
    }

    const [created] = await tx.insert(reports).values({ reporterId: user.id, targetType, targetId, spaceId, reason, details }).returning({ id: reports.id });
    return privateJson({ id: created.id }, 201);
  });
});
