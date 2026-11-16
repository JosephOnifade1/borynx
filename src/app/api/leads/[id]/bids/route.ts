import { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { leadBids, leads } from "@/db/schema";
import { handler, num, readJson, str } from "@/lib/api";
import { HttpError, requireActor } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { screenContent } from "@/lib/services";
import { routes } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: NextRequest, { params }) => {
  const actor = await requireActor();
  const leadId = num(params.id);
  const body = await readJson<{ message?: string; amount?: number }>(req);
  const message = str(body.message, "pitch", { min: 20, max: 4000 });
  const amount = Math.max(0, Math.round(Number(body.amount) || 0));

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead || lead.isRemoved) throw new HttpError(404, "Lead not found", "not_found");
  if (lead.status !== "open") throw new HttpError(400, "This lead is no longer accepting bids");
  if (lead.authorId === actor.id) throw new HttpError(400, "You can't bid on your own lead");
  const [dupe] = await db.select({ id: leadBids.id }).from(leadBids).where(and(eq(leadBids.leadId, leadId), eq(leadBids.userId, actor.id))).limit(1);
  if (dupe) throw new HttpError(409, "You already bid on this lead", "conflict");
  screenContent(message);

  const created = await db.transaction(async (tx) => {
    const [bid] = await tx.insert(leadBids).values({ leadId, userId: actor.id, message, amount }).returning();
    await tx.update(leads).set({ bidCount: sql`${leads.bidCount} + 1` }).where(eq(leads.id, leadId));

    await createNotification(
      {
        userId: lead.authorId,
        actorId: actor.id,
        type: "lead_bid",
        entityType: "lead",
        entityId: lead.id,
        message: `${actor.displayName} submitted a pitch on your lead: "${lead.title}"`,
        href: routes.lead(lead.id, lead.slug),
      },
      tx,
    );

    return bid;
  });
  return Response.json({ id: created.id }, { status: 201 });
});
