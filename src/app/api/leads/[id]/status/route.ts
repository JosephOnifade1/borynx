import { and, eq, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { leadBids, leads, type Lead } from "@/db/schema";
import { handler, readJson } from "@/lib/api";
import { HttpError, requireActor } from "@/lib/auth";
import { lockLead, parseLeadId, publicLead } from "@/lib/lead-access";
import { canSelectBid, hasNoAward, matchesLeadAward, parseLeadAction } from "@/lib/lead-engagement";
import { clearLeadKickoff } from "@/lib/lead-kickoff";

export const dynamic = "force-dynamic";

function statusResponse(status: Lead["status"], completedAt?: Date | null) {
  return Response.json({ status, ...(completedAt ? { completedAt: completedAt.toISOString() } : {}) }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export const PATCH = handler(async (req, { params }) => {
  const actor = await requireActor();
  const leadId = parseLeadId(params.id);
  const action = parseLeadAction(await readJson(req));

  return db.transaction(async (tx) => {
    const lead = await lockLead(tx, leadId, or(publicLead, and(
      eq(leads.authorId, actor.id), eq(leads.isRemoved, false), ne(leads.publicationStatus, "published"),
    )));
    if (lead.authorId !== actor.id) throw new HttpError(403, "Only the lead author can change its outcome", "forbidden");
    const published = lead.publicationStatus === "published";

    if (action === "withdraw" || action === "close_without_hire") {
      // Withdrawal is the Phase 1 author action on a private submission, not an award outcome.
      const eligible = action === "withdraw" ? lead.publicationStatus === "pending_review" || lead.publicationStatus === "changes_requested" : published;
      if (!eligible || (!canSelectBid(lead) && !(lead.status === "closed" && hasNoAward(lead)))) {
        throw new HttpError(409, "This lead cannot be closed with that action", "lead_conflict");
      }
      if (lead.status !== "closed") await tx.update(leads).set({ status: "closed" }).where(eq(leads.id, leadId));
      return statusResponse("closed");
    }

    const next = action === "complete" ? "completed" : "cancelled";
    if (!published || (lead.status !== "awarded" && lead.status !== next) || lead.awardNeedsReview || lead.acceptedBidId === null) {
      throw new HttpError(409, "Only an awarded lead can be completed or cancelled", "lead_conflict");
    }
    const [bid] = await tx.select({ id: leadBids.id, leadId: leadBids.leadId, userId: leadBids.userId, isAccepted: leadBids.isAccepted })
      .from(leadBids).where(and(eq(leadBids.id, lead.acceptedBidId), eq(leadBids.leadId, leadId))).limit(1).for("update");
    if (!matchesLeadAward(lead, bid)) throw new HttpError(409, "This lead has no confirmed winning pitch", "lead_conflict");
    if (lead.status === next) return statusResponse(next, lead.completedAt);

    const completedAt = action === "complete" ? new Date() : null;
    await tx.update(leads).set({ status: next, completedAt }).where(eq(leads.id, leadId));
    await clearLeadKickoff(tx, leadId);
    return statusResponse(next, completedAt);
  });
});
