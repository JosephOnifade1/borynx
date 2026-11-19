import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, type Database } from "@/db";
import { leadBids, leadKickoffs, leads, notifications } from "@/db/schema";
import { HttpError } from "./errors";
import { activeLeadAward, lockLead, matchingLeadAward, matchingLeadKickoff, publicLead } from "./lead-access";
import type { KickoffInput } from "./lead-kickoff-input";
import { createNotification } from "./notifications";
import { screenContent } from "./services";
import { routes } from "./utils";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Role = "buyer" | "winner";

/** Only the participant session can read the note. A changed award never inherits private data. */
export async function getLeadKickoff(leadId: number, viewerId: number) {
  const [row] = await db.select({
    authorId: leads.authorId,
    details: { note: leadKickoffs.note, contact: leadKickoffs.contact, startDate: leadKickoffs.startDate, acknowledgedAt: leadKickoffs.acknowledgedAt },
  }).from(leads).innerJoin(leadBids, matchingLeadAward).leftJoin(leadKickoffs, eq(leadKickoffs.leadId, leads.id))
    .where(and(eq(leads.id, leadId), activeLeadAward, or(eq(leads.authorId, viewerId), eq(leadBids.userId, viewerId)),
      or(isNull(leadKickoffs.leadId), matchingLeadKickoff),
    )).limit(1);
  if (!row) return null;
  const role: Role = row.authorId === viewerId ? "buyer" : "winner";
  return { role, details: row.details };
}

/** Lead → accepted bid → kickoff. Outcome changes and report removals take the same lead lock. */
async function lockKickoffAward(tx: Tx, leadId: number, actorId: number, role: Role) {
  const lead = await lockLead(tx, leadId, publicLead);
  if ((role === "buyer" ? lead.authorId : lead.assignedUserId) !== actorId) {
    throw new HttpError(403, role === "buyer" ? "Only the buyer can send kickoff details." : "Only the winner can acknowledge kickoff details.", "forbidden");
  }
  const [award] = await tx.select({ bidId: leadBids.id, buyerId: leads.authorId, winnerId: leadBids.userId })
    .from(leads).innerJoin(leadBids, matchingLeadAward).where(and(eq(leads.id, leadId), activeLeadAward)).limit(1).for("share", { of: leadBids });
  if (!award) throw new HttpError(409, "Kickoff is available only while the lead has an active, confirmed award.", "kickoff_unavailable");
  return { lead, award };
}

export function sendLeadKickoff(leadId: number, actorId: number, input: KickoffInput) {
  return db.transaction(async (tx) => {
    const { lead, award } = await lockKickoffAward(tx, leadId, actorId, "buyer");
    // Like a private pitch, block dangerous content without copying these details to a moderation report.
    screenContent(`${input.note}\n${input.contact}`);
    const [created] = await tx.insert(leadKickoffs).values({ leadId, ...award, ...input })
      .onConflictDoNothing({ target: leadKickoffs.leadId }).returning({ leadId: leadKickoffs.leadId });
    if (!created) throw new HttpError(409, "Kickoff details can only be sent once.", "kickoff_exists");
    await createNotification({
      userId: award.winnerId, actorId, type: "lead_kickoff", entityType: "lead", entityId: leadId,
      message: `The buyer sent kickoff details for “${lead.title}”.`, href: `${routes.lead(lead.id, lead.slug)}#kickoff`,
    }, tx);
    return { state: "sent" } as const;
  });
}

export function acknowledgeLeadKickoff(leadId: number, actorId: number) {
  return db.transaction(async (tx) => {
    const { lead, award } = await lockKickoffAward(tx, leadId, actorId, "winner");
    const scope = and(eq(leadKickoffs.leadId, leadId), eq(leadKickoffs.bidId, award.bidId),
      eq(leadKickoffs.buyerId, award.buyerId), eq(leadKickoffs.winnerId, award.winnerId),
    );
    const [updated] = await tx.update(leadKickoffs).set({ acknowledgedAt: sql`clock_timestamp()` })
      .where(and(scope, isNull(leadKickoffs.acknowledgedAt))).returning({ leadId: leadKickoffs.leadId });
    if (updated) {
      await createNotification({
        userId: award.buyerId, actorId, type: "lead_kickoff", entityType: "lead", entityId: leadId,
        message: `The winner acknowledged kickoff details for “${lead.title}”.`, href: `${routes.lead(lead.id, lead.slug)}#kickoff`,
      }, tx);
    } else {
      const [existing] = await tx.select({ leadId: leadKickoffs.leadId }).from(leadKickoffs).where(scope).limit(1);
      if (!existing) throw new HttpError(409, "No kickoff details have been sent for this award.", "kickoff_missing");
    }
    return { state: "acknowledged" } as const;
  });
}

/** Called with the lead locked, in the same transaction as completion, cancellation or removal. */
export async function clearLeadKickoff(tx: Tx, leadId: number) {
  const [deleted] = await tx.delete(leadKickoffs).where(eq(leadKickoffs.leadId, leadId))
    .returning({ buyerId: leadKickoffs.buyerId, winnerId: leadKickoffs.winnerId });
  if (deleted) {
    await tx.delete(notifications).where(and(inArray(notifications.userId, [deleted.buyerId, deleted.winnerId]),
      eq(notifications.type, "lead_kickoff"), eq(notifications.entityType, "lead"), eq(notifications.entityId, leadId),
    ));
  }
}
