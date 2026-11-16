import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, leads, modActions, posts, reports } from "@/db/schema";
import { handler, num, oneOf, readJson } from "@/lib/api";
import { canModerateSpace, HttpError, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** PATCH { action: "approve" | "dismiss" } — approve removes the content and resolves all sibling reports. */
export const PATCH = handler(async (req: NextRequest, { params }) => {
  const actor = await requireUser();
  const id = num(params.id);
  const { action } = await readJson<{ action?: string }>(req);
  const decision = oneOf(action, ["approve", "dismiss"] as const, "action");

  const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (!report) throw new HttpError(404, "Report not found");
  const allowed = report.spaceId ? await canModerateSpace(actor, report.spaceId) : actor.role !== "member";
  if (!allowed) throw new HttpError(403, "You don't moderate this space", "forbidden");

  await db.transaction(async (tx) => {
    const status = decision === "approve" ? "approved" : "dismissed";
    // Resolve every pending report pointing at the same target in one sweep.
    await tx
      .update(reports)
      .set({ status, reviewedById: actor.id, reviewedAt: new Date() })
      .where(eq(reports.id, id));
    if (decision === "approve") {
      let authorId: number | null = null;
      if (report.targetType === "post") {
        const [r] = await tx.update(posts).set({ isRemoved: true }).where(eq(posts.id, report.targetId)).returning({ authorId: posts.authorId });
        authorId = r?.authorId ?? null;
      } else if (report.targetType === "comment") {
        const [r] = await tx.update(comments).set({ isRemoved: true }).where(eq(comments.id, report.targetId)).returning({ authorId: comments.authorId });
        authorId = r?.authorId ?? null;
      } else {
        const [r] = await tx.update(leads).set({ isRemoved: true, status: "closed" }).where(eq(leads.id, report.targetId)).returning({ authorId: leads.authorId });
        authorId = r?.authorId ?? null;
      }
      await tx.insert(modActions).values({ moderatorId: actor.id, targetUserId: authorId, action: "remove_content", reason: `Report #${id}: ${report.reason}` });
      const siblings = await tx.select({ id: reports.id }).from(reports).where(eq(reports.targetId, report.targetId));
      for (const s of siblings) {
        if (s.id !== id) await tx.update(reports).set({ status: "approved", reviewedById: actor.id, reviewedAt: new Date() }).where(eq(reports.id, s.id));
      }
    }
  });
  return Response.json({ ok: true, status: decision === "approve" ? "approved" : "dismissed" });
});
