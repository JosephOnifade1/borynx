import { and, eq, exists, gt, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { leads, spaces, type Lead } from "@/db/schema";
import { HttpError } from "./errors";

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
export const openPublicLead = and(publicLead, eq(leads.status, "open"), or(isNull(leads.deadlineAt), gt(leads.deadlineAt, sql`now()`)))!;

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
export function isAcceptingBids(lead: Pick<Lead, "status" | "deadlineAt">, now = Date.now()): boolean {
  return lead.status === "open" && (lead.deadlineAt === null || lead.deadlineAt.getTime() > now);
}
