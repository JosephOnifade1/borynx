import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { leadBids, leads, type Lead } from "@/db/schema";
import { handler } from "@/lib/api";
import { HttpError, requireActor } from "@/lib/auth";
import { lockLead, parseLeadId, publicLead } from "@/lib/lead-access";
import { canSelectBid, matchesLeadAward } from "@/lib/lead-engagement";
import { createNotification } from "@/lib/notifications";
import { routes } from "@/lib/utils";

export const dynamic = "force-dynamic";

function awardResponse(acceptedBidId: number, assignedUserId: number, status: Lead["status"]) {
  return Response.json({ acceptedBidId, assignedUserId, status }, { headers: { "Cache-Control": "private, no-store" } });
}

export const POST = handler(async (_req, { params }) => {
  const actor = await requireActor();
  const leadId = parseLeadId(params.id);
  const bidId = parseLeadId(params.bidId);

  return db.transaction(async (tx) => {
    const lead = await lockLead(tx, leadId, publicLead);
    // Site and space moderation roles do not confer permission to hire for somebody else.
    if (lead.authorId !== actor.id) throw new HttpError(403, "Only the lead author can award it", "forbidden");
    const [bid] = await tx.select({ id: leadBids.id, leadId: leadBids.leadId, userId: leadBids.userId, isAccepted: leadBids.isAccepted })
      .from(leadBids).where(and(eq(leadBids.id, bidId), eq(leadBids.leadId, leadId))).limit(1).for("update");
    if (!bid) throw new HttpError(404, "Pitch not found", "not_found");

    if ((lead.status === "awarded" || lead.status === "completed" || lead.status === "cancelled") && matchesLeadAward(lead, bid)) {
      return awardResponse(bid.id, bid.userId, lead.status);
    }
    // A deadline stops new pitches, not selection from pitches already submitted.
    if (!canSelectBid(lead) || bid.userId === lead.authorId) {
      throw new HttpError(409, "This lead cannot be awarded to this bidder", "lead_conflict");
    }
    const [strayWinner] = await tx.select({ id: leadBids.id }).from(leadBids)
      .where(and(eq(leadBids.leadId, leadId), eq(leadBids.isAccepted, true))).limit(1);
    if (strayWinner) throw new HttpError(409, "This lead has an inconsistent award record", "lead_conflict");

    await tx.update(leadBids).set({ isAccepted: true }).where(eq(leadBids.id, bid.id));
    await tx.update(leads).set({ acceptedBidId: bid.id, assignedUserId: bid.userId, status: "awarded", awardedAt: new Date() })
      .where(eq(leads.id, leadId));
    // Selecting a pitch is not independent evidence of work. It awards no reputation.
    await createNotification({
      userId: bid.userId, actorId: actor.id, type: "lead_bid_accepted", entityType: "lead", entityId: lead.id,
      message: `${actor.displayName} awarded you “${lead.title}”.`,
      href: `${routes.lead(lead.id, lead.slug)}#kickoff`,
    }, tx);
    return awardResponse(bid.id, bid.userId, "awarded");
  });
});
