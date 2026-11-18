import { and, count, eq, exists, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { leadBids, leads } from "@/db/schema";
import { openPublicLead, publicLead } from "./lead-access";

export interface PublicHiringCounts {
  published: number;
  accepting: number;
  completed: number;
}

/** Visitor, owner and staff all see the same public-only totals, independent of the feed window. */
export async function getPublicHiringCounts(authorId: number): Promise<PublicHiringCounts> {
  const recordedCompletion = and(
    eq(leads.status, "completed"), isNotNull(leads.completedAt), eq(leads.awardNeedsReview, false),
    // Same evidence as matchesLeadAward. Do not return the pitch, its owner, or the award ID.
    exists(db.select({ id: leadBids.id }).from(leadBids).where(and(
      eq(leadBids.id, leads.acceptedBidId), eq(leadBids.leadId, leads.id),
      eq(leadBids.userId, leads.assignedUserId), ne(leadBids.userId, leads.authorId), eq(leadBids.isAccepted, true),
    ))),
  );
  const [counts] = await db.select({
    published: count(),
    accepting: sql<number>`count(*) filter (where ${openPublicLead})`.mapWith(Number),
    completed: sql<number>`count(*) filter (where ${recordedCompletion})`.mapWith(Number),
  }).from(leads).where(and(eq(leads.authorId, authorId), publicLead));
  return counts;
}
