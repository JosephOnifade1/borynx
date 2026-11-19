import { and, eq, exists, gt, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { leadBids, leadKickoffs, leads, spaces, type Lead } from "@/db/schema";
import { HttpError } from "./errors";
import { getLeadEngagement } from "./lead-engagement";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function parseLeadId(value: string | undefined): number {
  if (value && /^\d{1,10}$/.test(value)) {
    const id = Number(value);
    if (id > 0 && id <= 2_147_483_647) return id;
  }
  throw new HttpError(400, "Invalid lead ID", "bad_request");
}

// Correlated space check for both joined and standalone lead queries. Restricted/private spaces
// do not belong in public marketplace discovery even if someone can read their threads.
export const leadInPublicSpace = or(
  isNull(leads.spaceId),
  exists(db.select({ id: spaces.id }).from(spaces).where(and(eq(spaces.id, leads.spaceId), eq(spaces.privacy, "public")))),
)!;

export const publicLead = and(eq(leads.publicationStatus, "published"), eq(leads.isRemoved, false), leadInPublicSpace)!;
export const openPublicLead = and(
  publicLead, eq(leads.status, "open"), eq(leads.awardNeedsReview, false),
  isNull(leads.acceptedBidId), isNull(leads.assignedUserId),
  or(isNull(leads.deadlineAt), gt(leads.deadlineAt, sql`now()`)),
)!;

/** An opt-in service is only available after manual publication, on an open public lead. */
export const serviceEligibleLead = and(openPublicLead, isNotNull(leads.publishedAt), isNotNull(leads.reviewedAt))!;

/** A slot covers review, revision and an open listing; an elapsed bid deadline alone does not close it. */
export const activeLeadSubmission = and(eq(leads.isRemoved, false), inArray(leads.status, ["open", "in_review"]),
  ne(leads.publicationStatus, "rejected"), eq(leads.awardNeedsReview, false), isNull(leads.acceptedBidId), isNull(leads.assignedUserId))!;

// The SQL equivalent of matchesLeadAward. Keep the canonical pointers, bid ownership,
// and accepted flag together; a closed listing or a stray accepted flag alone is not evidence.
export const matchingLeadAward = and(eq(leads.awardNeedsReview, false),
  eq(leadBids.id, leads.acceptedBidId), eq(leadBids.leadId, leads.id), eq(leadBids.userId, leads.assignedUserId),
  ne(leadBids.userId, leads.authorId), eq(leadBids.isAccepted, true),
)!;
export const activeLeadAward = and(publicLead, eq(leads.status, "awarded"), isNull(leads.completedAt))!;
export const matchingLeadKickoff = and(eq(leadKickoffs.leadId, leads.id), eq(leadKickoffs.bidId, leadBids.id),
  eq(leadKickoffs.buyerId, leads.authorId), eq(leadKickoffs.winnerId, leadBids.userId),
)!;
export const explicitlyCompletedLead = and(eq(leads.status, "completed"), isNotNull(leads.completedAt))!;
export const recordedLeadCompletion = and(explicitlyCompletedLead,
  exists(db.select({ id: leadBids.id }).from(leadBids).where(matchingLeadAward)),
)!;

export function leadDetailAccess(userId: number | undefined, siteReviewer: boolean) {
  if (siteReviewer) return undefined;
  if (!userId) return publicLead;
  return and(eq(leads.isRemoved, false), or(publicLead, eq(leads.authorId, userId)));
}

/** Lock before making any lead mutation so publication decisions, withdrawals and report removals serialize. */
export async function lockLead(tx: Tx, id: number, access?: SQL): Promise<Lead> {
  const [lead] = await tx.select().from(leads).where(and(eq(leads.id, id), access)).limit(1).for("update");
  if (!lead) throw new HttpError(404, "Lead not found", "not_found");
  return lead;
}

/** Call only after public visibility is checked. Publication and accepting pitches are independent. */
export function isAcceptingBids(lead: Parameters<typeof getLeadEngagement>[0], now = Date.now()): boolean {
  return getLeadEngagement(lead, now) === "open";
}
