import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { leadBids, leads } from "@/db/schema";
import { handler, readJson } from "@/lib/api";
import { HttpError, requireActor } from "@/lib/auth";
import { isAcceptingBids, lockLead, parseLeadId, publicLead } from "@/lib/lead-access";
import { parseBidInput } from "@/lib/lead-engagement";
import { createNotification } from "@/lib/notifications";
import { assertRateLimit, screenContent } from "@/lib/services";
import { routes } from "@/lib/utils";

export const dynamic = "force-dynamic";

const BID_RATE_LOCK = 4_242_004;

export const POST = handler(async (req, { params }) => {
  const actor = await requireActor();
  const leadId = parseLeadId(params.id);
  const { amount, message } = parseBidInput(await readJson(req));

  const id = await db.transaction(async (tx) => {
    // Same bidder across different leads shares a limit. Take this lock before the lead lock.
    await tx.execute(sql`select pg_advisory_xact_lock(${BID_RATE_LOCK}::integer, ${actor.id}::integer)`);
    const lead = await lockLead(tx, leadId, publicLead);
    if (lead.authorId === actor.id) throw new HttpError(403, "You can't bid on your own lead", "forbidden");
    if (!isAcceptingBids(lead)) throw new HttpError(409, "This lead is no longer accepting bids", "lead_closed");
    const [dupe] = await tx.select({ id: leadBids.id }).from(leadBids).where(and(eq(leadBids.leadId, leadId), eq(leadBids.userId, actor.id))).limit(1);
    if (dupe) throw new HttpError(409, "You already sent a pitch for this lead", "bid_conflict");
    await assertRateLimit(actor.id, "bid", tx);
    screenContent(message);

    const [bid] = await tx.insert(leadBids).values({ leadId, userId: actor.id, message, amount })
      .onConflictDoNothing({ target: [leadBids.leadId, leadBids.userId] }).returning({ id: leadBids.id });
    if (!bid) throw new HttpError(409, "You already sent a pitch for this lead", "bid_conflict");
    await tx.update(leads).set({ bidCount: sql`${leads.bidCount} + 1` }).where(eq(leads.id, leadId));

    await createNotification({
      userId: lead.authorId, actorId: actor.id, type: "lead_bid", entityType: "lead", entityId: lead.id,
      message: `${actor.displayName} submitted a pitch on your lead: “${lead.title}”`,
      href: `${routes.lead(lead.id, lead.slug)}#bid`,
    }, tx);
    return bid.id;
  });
  return Response.json({ id }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
});
