import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { openPublicLead, publicLead, recordedLeadCompletion } from "./lead-access";

export interface PublicHiringCounts {
  published: number;
  accepting: number;
  completed: number;
}

/** Visitor, owner and staff all see the same public-only totals, independent of the feed window. */
export async function getPublicHiringCounts(authorId: number): Promise<PublicHiringCounts> {
  const [counts] = await db.select({
    published: count(),
    accepting: sql<number>`count(*) filter (where ${openPublicLead})`.mapWith(Number),
    completed: sql<number>`count(*) filter (where ${recordedLeadCompletion})`.mapWith(Number),
  }).from(leads).where(and(eq(leads.authorId, authorId), publicLead));
  return counts;
}
