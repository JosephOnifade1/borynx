import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { leadBids, leads } from "@/db/schema";
import { handler } from "@/lib/api";
import { HttpError, requireActor } from "@/lib/auth";
import { lockLead, parseLeadId, publicLead } from "@/lib/lead-access";
import { createNotification } from "@/lib/notifications";
import { karmaForLeadWon } from "@/lib/karma";
import { applyKarma, evaluateBadges } from "@/lib/services";
import { routes } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const POST = handler(async (_req: NextRequest, { params }) => {
  const actor = await requireActor();
  const leadId = parseLeadId(params.id);
  const bidId = parseLeadId(params.bidId);

  return db.transaction(async (tx) => {
    const lead = await lockLead(tx, leadId, publicLead);
    const isOwner = lead.authorId === actor.id;
    const isStaff = actor.role === "admin" || actor.role === "moderator";
    if (!isOwner && !isStaff) throw new HttpError(403, "Only the lead creator can accept a bid", "forbidden");

    const [bid] = await tx.select().from(leadBids).where(and(eq(leadBids.id, bidId), eq(leadBids.leadId, leadId))).limit(1);
    if (!bid) throw new HttpError(404, "Bid not found", "not_found");

    // Reset any previous accepted bids
    await tx.update(leadBids).set({ isAccepted: false }).where(eq(leadBids.leadId, leadId));

    // Mark this bid as accepted
    await tx.update(leadBids).set({ isAccepted: true }).where(eq(leadBids.id, bidId));

    // Update lead status and assignment
    await tx
      .update(leads)
      .set({
        acceptedBidId: bid.id,
        assignedUserId: bid.userId,
        status: "closed",
      })
      .where(eq(leads.id, leadId));

    // Award reputation karma to the winning freelancer
    await applyKarma(tx, bid.userId, karmaForLeadWon());

    await evaluateBadges(bid.userId, tx);

    // Notify the winning freelancer
    await createNotification(
      {
        userId: bid.userId,
        actorId: actor.id,
        type: "lead_bid",
        entityType: "lead",
        entityId: lead.id,
        message: `🎉 ${actor.displayName} accepted your bid on "${lead.title}"! (+50 karma)`,
        href: routes.lead(lead.id, lead.slug),
      },
      tx,
    );
    return Response.json({ ok: true, acceptedBidId: bid.id, assignedUserId: bid.userId, status: "closed" });
  });
});
