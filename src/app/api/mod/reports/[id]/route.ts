import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, leads, modActions, posts, reports } from "@/db/schema";
import { handler, num, oneOf, readJson } from "@/lib/api";
import { canModerateSpace, HttpError, isSiteStaff, requireActor } from "@/lib/auth";
import { publicLead } from "@/lib/lead-access";

export const dynamic = "force-dynamic";

/** Approving a report removes the content. It is never a decision to publish a lead. */
export const PATCH = handler(async (req, { params }) => {
  const actor = await requireActor();
  const id = num(params.id);
  const { action } = await readJson<{ action?: string }>(req);
  const decision = oneOf(action, ["approve", "dismiss"] as const, "action");

  const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (!report) throw new HttpError(404, "Report not found");
  const siteStaff = isSiteStaff(actor);
  const allowed = siteStaff || (report.spaceId !== null && await canModerateSpace(actor, report.spaceId));
  if (!allowed) {
    if (report.targetType === "lead") throw new HttpError(404, "Report not found");
    throw new HttpError(403, "You don't moderate this space", "forbidden");
  }

  return db.transaction(async (tx) => {
    // Lock content before report rows, in the same order as reporting, editing and publishing.
    if (report.targetType === "lead") {
      const [lead] = await tx.select({ id: leads.id }).from(leads)
        .where(and(eq(leads.id, report.targetId), siteStaff ? undefined : publicLead)).for("update");
      if (!siteStaff && !lead) throw new HttpError(404, "Report not found");
    } else if (decision === "approve" && report.targetType === "post") {
      await tx.select({ id: posts.id }).from(posts).where(eq(posts.id, report.targetId)).for("update");
    } else if (decision === "approve") {
      await tx.select({ id: comments.id }).from(comments).where(eq(comments.id, report.targetId)).for("update");
    }
    const status = decision === "approve" ? "approved" : "dismissed";
    const reviewedAt = new Date();
    const changes = { status, reviewedById: actor.id, reviewedAt } as const;
    const [resolved] = await tx.update(reports).set(changes).where(and(eq(reports.id, id), eq(reports.status, "pending"))).returning({ id: reports.id });
    if (!resolved) throw new HttpError(409, "This report was already resolved", "report_conflict");
    if (decision === "approve") {
      let authorId: number | null = null;
      if (report.targetType === "post") {
        const [r] = await tx.update(posts).set({ isRemoved: true }).where(eq(posts.id, report.targetId)).returning({ authorId: posts.authorId });
        authorId = r?.authorId ?? null;
      } else if (report.targetType === "comment") {
        const [r] = await tx.update(comments).set({ isRemoved: true }).where(eq(comments.id, report.targetId)).returning({ authorId: comments.authorId });
        authorId = r?.authorId ?? null;
      } else {
        const [r] = await tx.update(leads).set({ isRemoved: true }).where(eq(leads.id, report.targetId)).returning({ authorId: leads.authorId });
        authorId = r?.authorId ?? null;
      }
      await tx.insert(modActions).values({ moderatorId: actor.id, targetUserId: authorId, action: "remove_content", reason: `Report #${id}: ${report.reason}` });
      await tx.update(reports).set(changes).where(and(
        eq(reports.targetId, report.targetId), eq(reports.targetType, report.targetType), eq(reports.status, "pending"),
      ));
    }
    return Response.json({ ok: true, status });
  });
});
