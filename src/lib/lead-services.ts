import "server-only";
import { and, desc, eq, gt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { authIdentities, leads, leadServiceOrders, users } from "@/db/schema";
import { isSuspended, type ResolvedSession } from "./auth";
import { HttpError } from "./errors";
import { lockLead, serviceEligibleLead } from "./lead-access";
import { SPONSOR_DAYS, type LeadServiceAction, type LeadServiceKind, type LeadServiceState } from "./lead-service-input";
import { leadServicePrice } from "./lead-service-policy";

const SLOT_LOCK = 4_242_004;
const notFound = () => new HttpError(404, "Lead service not available", "not_found");
const conflict = (message: string) => new HttpError(409, message, "service_conflict");
const orderResult = { id: leadServiceOrders.id, state: leadServiceOrders.state };
const boardSlot = and(eq(leadServiceOrders.kind, "sponsored_lead"), eq(leadServiceOrders.state, "confirmed"))!;
export const liveSponsorship = and(boardSlot, gt(leadServiceOrders.sponsorUntil, sql`now()`))!;

export async function requestLeadService(leadId: number, buyer: Extract<ResolvedSession, { kind: "email" }>, kind: LeadServiceKind) {
  const amountMinor = leadServicePrice(kind);
  if (amountMinor === null) throw notFound();
  return db.transaction(async (tx) => {
    await lockLead(tx, leadId, and(serviceEligibleLead, eq(leads.authorId, buyer.user.id)));
    const match = and(eq(leadServiceOrders.leadId, leadId), eq(leadServiceOrders.buyerId, buyer.user.id), eq(leadServiceOrders.kind, kind));
    const [existing] = await tx.select(orderResult).from(leadServiceOrders).where(match).limit(1);
    if (existing) return { order: existing, status: 200 };
    // The buyer explicitly consented to contact. Store a reference to the exact sign-in,
    // not a duplicate email address or any bank/payment details.
    const [order] = await tx.insert(leadServiceOrders).values({
      leadId, buyerId: buyer.user.id, contactIdentityId: buyer.authIdentityId, kind, amountMinor,
    }).returning(orderResult);
    return { order, status: 201 };
  }, { isolationLevel: "read committed" });
}

/** The route authorizes an eligible verified administrator before calling this writer. */
export async function updateLeadService(id: number, adminId: number, action: LeadServiceAction) {
  return db.transaction(async (tx) => {
    const [target] = await tx.select({ leadId: leadServiceOrders.leadId }).from(leadServiceOrders).where(eq(leadServiceOrders.id, id)).limit(1);
    if (!target) throw notFound();
    // Lead then order: serialize against awards, closure and other service writes.
    const lead = await lockLead(tx, target.leadId);
    const [order] = await tx.select().from(leadServiceOrders).where(eq(leadServiceOrders.id, id)).limit(1).for("update");
    if (!order) throw notFound();
    if (order.buyerId === adminId) throw new HttpError(403, "Another administrator must handle your request.", "forbidden");

    let state: LeadServiceState;
    let confirmedAt = order.confirmedAt;
    let sponsorUntil = order.sponsorUntil;
    switch (action) {
      case "confirm_payment": {
        if (order.state !== "requested") throw conflict("This request is no longer awaiting payment confirmation.");
        if (leadServicePrice(order.kind) === null) throw conflict("This service is not accepting new confirmations.");
        if (order.contactIdentityId === null) throw conflict("The verified contact for this request is no longer available.");
        const [buyer] = await tx.select({ isBanned: users.isBanned, banExpiresAt: users.banExpiresAt }).from(leads)
          .innerJoin(users, eq(users.id, leads.authorId))
          .innerJoin(authIdentities, and(eq(authIdentities.userId, users.id), eq(authIdentities.id, order.contactIdentityId)))
          .where(and(serviceEligibleLead, eq(leads.id, lead.id), eq(leads.authorId, order.buyerId))).limit(1);
        if (!buyer || isSuspended(buyer)) throw conflict("Only eligible verified buyers with approved public leads still accepting pitches can start a paid service.");
        if (order.kind === "sponsored_lead") {
          await tx.execute(sql`select pg_advisory_xact_lock(${SLOT_LOCK}::bigint)`);
          // Read committed: see reservations committed while waiting for the slot lock.
          // A reservation is honored until it expires or is refunded. Visibility is checked separately.
          const [reserved] = await tx.select({ id: leadServiceOrders.id }).from(leadServiceOrders)
            .where(and(boardSlot, gt(leadServiceOrders.sponsorUntil, new Date()))).limit(1);
          if (reserved) throw conflict("The sponsored slot is already reserved. Do not invoice a second placement yet.");
        }
        confirmedAt = new Date();
        if (order.kind === "sponsored_lead") sponsorUntil = new Date(confirmedAt.getTime() + SPONSOR_DAYS * 86_400_000);
        state = "confirmed";
        break;
      }
      case "deliver":
        if (order.kind !== "assisted_hire" || order.state !== "confirmed") throw conflict("Only a confirmed Assisted Hire request can be delivered.");
        state = "delivered";
        break;
      case "decline":
        if (order.state !== "requested") throw conflict("Only an unconfirmed request can be declined.");
        state = "declined";
        break;
      case "record_refund":
        if (order.state !== "confirmed" && order.state !== "delivered") throw conflict("Only a confirmed payment can be marked refunded.");
        state = "refunded";
        break;
    }
    const [updated] = await tx.update(leadServiceOrders).set({ state, updatedAt: new Date(), handledById: adminId, confirmedAt, sponsorUntil })
      .where(eq(leadServiceOrders.id, id)).returning(orderResult);
    return updated;
  }, { isolationLevel: "read committed" });
}

const visibleOrder = {
  ...orderResult, leadId: leadServiceOrders.leadId, kind: leadServiceOrders.kind, amountMinor: leadServiceOrders.amountMinor,
  title: leads.title, confirmedAt: leadServiceOrders.confirmedAt, sponsorUntil: leadServiceOrders.sponsorUntil,
};
const orderLead = and(eq(leadServiceOrders.leadId, leads.id), eq(leadServiceOrders.buyerId, leads.authorId));

export function buyerLeadServices(buyerId: number, leadId?: number) {
  return db.select(visibleOrder).from(leadServiceOrders).leftJoin(leads, orderLead)
    .where(and(eq(leadServiceOrders.buyerId, buyerId), leadId === undefined ? undefined : eq(leadServiceOrders.leadId, leadId)))
    .orderBy(desc(leadServiceOrders.createdAt), desc(leadServiceOrders.id)).limit(50);
}

export async function isSponsoredSlotReserved() {
  const [slot] = await db.select({ id: leadServiceOrders.id }).from(leadServiceOrders).where(liveSponsorship).limit(1);
  return Boolean(slot);
}

/** Only the verified administrator page calls this; buyer contact is never passed to a client component. */
export function leadServiceQueue(adminId: number) {
  const openRequest = or(eq(leadServiceOrders.state, "requested"),
    and(eq(leadServiceOrders.kind, "assisted_hire"), eq(leadServiceOrders.state, "confirmed")), liveSponsorship);
  return db.select({
    ...visibleOrder, buyer: users.username,
    contact: sql<string | null>`case when ${openRequest} then ${authIdentities.email} else null end`,
    eligible: sql<boolean>`coalesce((${serviceEligibleLead} and (not ${users.isBanned} or ${users.banExpiresAt} < now())), false)`,
  }).from(leadServiceOrders).leftJoin(leads, orderLead).innerJoin(users, eq(users.id, leadServiceOrders.buyerId))
    .leftJoin(authIdentities, and(eq(leadServiceOrders.contactIdentityId, authIdentities.id), eq(authIdentities.userId, leadServiceOrders.buyerId)))
    .where(ne(leadServiceOrders.buyerId, adminId))
    .orderBy(desc(sql`${leadServiceOrders.state} = 'requested'`), desc(leadServiceOrders.updatedAt), desc(leadServiceOrders.id)).limit(50);
}
