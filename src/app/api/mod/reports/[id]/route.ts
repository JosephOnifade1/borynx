import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, leads, modActions, posts, reports } from "@/db/schema";
import { assertSameOrigin, handler, num, oneOf, privateJson, readJson } from "@/lib/api";
import { canModerateSpace, HttpError, isSiteStaff, requireActor } from "@/lib/auth";
import { publicLead } from "@/lib/lead-access";
import { clearLeadKickoff } from "@/lib/lead-kickoff";
import { isReviewParticipant, lockLeadReview, recordLeadReviewDecision } from "@/lib/lead-reviews";

export const dynamic = "force-dynamic";

/** Approving removes or hides only the report's target. Dismissing is never a publication decision. */
export const PATCH = handler(async (req, { params }) => {
  const actor = await requireActor();
  const id = num(params.id);
  const body = await readJson<{ action?: string }>(req);
  const decision = oneOf(body?.action, ["approve", "dismiss"] as const, "action");

  const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (!report) throw new HttpError(404, "Report not found");
  const siteStaff = isSiteStaff(actor);
  if (report.targetType === "lead_review") {
    if (!siteStaff) throw new HttpError(404, "Report not found");
    assertSameOrigin(req);
  } else if (!siteStaff && (report.spaceId === null || !(await canModerateSpace(actor, report.spaceId)))) {
    if (report.targetType === "lead") throw new HttpError(404, "Report not found");
    throw new HttpError(403, "You don't moderate this space", "forbidden");
  }

  return db.transaction(async (tx) => {
    // Lock content before report rows, in the same order as reporting, editing and publishing.
    const review = report.targetType === "lead_review" ? await lockLeadReview(tx, report.targetId) : undefined;
    if (review && isReviewParticipant(actor.id, review)) {
      throw new HttpError(403, "Another moderator must decide on a review you participated in.", "forbidden");
    }
    if (report.targetType === "lead") {
      const [lead] = await tx.select({ id: leads.id }).from(leads)
        .where(and(eq(leads.id, report.targetId), siteStaff ? undefined : publicLead)).for("update");
      if (!siteStaff && !lead) throw new HttpError(404, "Report not found");
    } else if (decision === "approve" && report.targetType === "post") {
      await tx.select({ id: posts.id }).from(posts).where(eq(posts.id, report.targetId)).for("update");
    } else if (decision === "approve" && report.targetType === "comment") {
      await tx.select({ id: comments.id }).from(comments).where(eq(comments.id, report.targetId)).for("update");
    }
    const status = decision === "approve" ? "approved" : "dismissed";
    const reviewedAt = new Date();
    const changes = { status, reviewedById: actor.id, reviewedAt } as const;
    const [resolved] = await tx.update(reports).set(changes).where(and(eq(reports.id, id), eq(reports.status, "pending"))).returning({ id: reports.id });
    if (!resolved) throw new HttpError(409, "This report was already resolved", "report_conflict");
    if (decision === "approve") {
      const reason = `Report #${id}: ${report.reason}`;
      if (report.targetType === "lead_review") {
        if (review && review.visibility !== "hidden") await recordLeadReviewDecision(tx, review.id, actor.id, { action: "hide", reason }, reviewedAt);
      } else {
        let authorId: number | null = null;
        if (report.targetType === "post") {
          const [r] = await tx.update(posts).set({ isRemoved: true }).where(eq(posts.id, report.targetId)).returning({ authorId: posts.authorId });
          authorId = r?.authorId ?? null;
        } else if (report.targetType === "comment") {
          const [r] = await tx.update(comments).set({ isRemoved: true }).where(eq(comments.id, report.targetId)).returning({ authorId: comments.authorId });
          authorId = r?.authorId ?? null;
        } else if (report.targetType === "lead") {
          const [r] = await tx.update(leads).set({ isRemoved: true }).where(eq(leads.id, report.targetId)).returning({ authorId: leads.authorId });
          if (r) await clearLeadKickoff(tx, report.targetId);
          authorId = r?.authorId ?? null;
        }
        await tx.insert(modActions).values({ moderatorId: actor.id, targetUserId: authorId, action: "remove_content", reason });
      }
      await tx.update(reports).set(changes).where(and(
        eq(reports.targetId, report.targetId), eq(reports.targetType, report.targetType), eq(reports.status, "pending"),
      ));
    }
    return privateJson({ ok: true, status });
  });
});
