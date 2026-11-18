import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { leads, leadStatusEnum } from "@/db/schema";
import { handler, oneOf, readJson } from "@/lib/api";
import { HttpError, isSiteStaff, requireActor } from "@/lib/auth";
import { lockLead, parseLeadId, publicLead } from "@/lib/lead-access";
import { leadBody } from "@/lib/lead-input";

export const dynamic = "force-dynamic";

export const PATCH = handler(async (req, { params }) => {
  const actor = await requireActor();
  const leadId = parseLeadId(params.id);
  const body = leadBody(await readJson(req));
  const nextStatus = oneOf(body.status, leadStatusEnum.enumValues, "status");

  return db.transaction(async (tx) => {
    const lead = await lockLead(tx, leadId, and(eq(leads.isRemoved, false), or(publicLead, eq(leads.authorId, actor.id))));
    const isOwner = lead.authorId === actor.id;
    if (lead.publicationStatus !== "published") {
      // An unpublished brief can be withdrawn by its author, never opened to bidding here.
      if (!isOwner || nextStatus !== "closed" || lead.publicationStatus === "rejected") {
        throw new HttpError(409, "Unpublished submissions cannot be opened to bids.", "lead_conflict");
      }
    } else if (!isOwner && !isSiteStaff(actor)) {
      throw new HttpError(403, "Only the lead creator or staff can change status", "forbidden");
    }
    await tx.update(leads).set({ status: nextStatus }).where(eq(leads.id, leadId));
    return Response.json({ ok: true, status: nextStatus }, { headers: { "Cache-Control": "private, no-store" } });
  });
});
