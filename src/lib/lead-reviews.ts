import "server-only";
import { and, count, desc, eq, exists, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Database } from "@/db";
import { leadBids, leadReviewDecisions, leadReviews, leads, reports, users, type LeadReview } from "@/db/schema";
import { HttpError } from "./errors";
import { activeLeadAward, explicitlyCompletedLead, lockLead, matchingLeadAward, publicLead, recordedLeadCompletion } from "./lead-access";
import { MIN_BUYERS_FOR_RATING, type ReviewCursor, type ReviewDecision, type ReviewInput, type ReviewResult, type ReviewVisibility } from "./lead-review-input";
import { findLeadReviewSignals, SIGNAL_SAMPLE_SIZE, SIGNAL_WINDOW_DAYS } from "./lead-review-signals";
import { screenContent } from "./services";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const pageSize = 10;
const reviewNotFound = () => new HttpError(404, "Review not found", "not_found");
const notEligible = () => new HttpError(409, "A review requires a publicly eligible completed lead with a confirmed winner.", "review_ineligible");

const eligibleReviewEngagement = exists(db.select({ id: leads.id }).from(leads).where(and(
  eq(leads.id, leadReviews.leadId), eq(leads.authorId, leadReviews.reviewerId), eq(leads.assignedUserId, leadReviews.recipientId),
  publicLead, recordedLeadCompletion,
)));
const visibleReview = and(eq(leadReviews.visibility, "published"), eligibleReviewEngagement)!;
const publicReviewsFor = (recipientId: number) => and(eq(leadReviews.recipientId, recipientId), visibleReview);

export async function createLeadReview(leadId: number, buyerId: number, input: ReviewInput): Promise<ReviewResult> {
  return db.transaction(async (tx) => {
    const lead = await lockLead(tx, leadId, publicLead);
    if (lead.authorId !== buyerId) throw new HttpError(403, "Only the buyer can review this engagement.", "forbidden");

    const [award] = await tx.select({ reviewerId: leads.authorId, recipientId: leadBids.userId })
      .from(leads).innerJoin(leadBids, matchingLeadAward)
      .where(and(eq(leads.id, leadId), explicitlyCompletedLead, publicLead)).limit(1).for("share", { of: leadBids });
    if (!award) throw notEligible();
    const duplicate = () => new HttpError(409, "You already reviewed this engagement.", "review_exists");
    // Check before screening for a useful duplicate response even if the retry contains flagged text.
    const [existing] = await tx.select({ id: leadReviews.id }).from(leadReviews).where(eq(leadReviews.leadId, leadId));
    if (existing) throw duplicate();
    const verdict = screenContent(input.testimonial);
    const [created] = await tx.insert(leadReviews).values({
      leadId, ...award, ...input, visibility: verdict.needsReview ? "pending_review" : "published",
    }).onConflictDoNothing({ target: leadReviews.leadId }).returning({ id: leadReviews.id, visibility: leadReviews.visibility });
    if (!created) throw duplicate();
    if (verdict.needsReview) {
      // This is a site-wide case even if the lead is in a space. Don't copy links or testimonial
      // text into the report: it can outlive this review under the existing report policy.
      await tx.insert(reports).values({
        targetType: "lead_review", targetId: created.id, reason: "automated_filter",
        details: `Auto-filter: ${verdict.flags.map((flag) => flag.code).join(", ")}`,
      });
    }
    return created;
  });
}

/** The lead page calls this only for its buyer. A status never includes held text or an audit note. */
export async function getBuyerReviewSlot(leadId: number, buyerId: number) {
  const [row] = await db.select({ username: users.username, displayName: users.displayName, visibility: leadReviews.visibility })
    .from(leads).innerJoin(users, eq(leads.assignedUserId, users.id)).leftJoin(leadReviews, eq(leadReviews.leadId, leads.id))
    .where(and(eq(leads.id, leadId), eq(leads.authorId, buyerId), publicLead, recordedLeadCompletion,
      // If an operator repairs inconsistent award pointers, don't offer a second review or claim
      // the stored review was published for a different recipient.
      or(isNull(leadReviews.id), and(eq(leadReviews.reviewerId, leads.authorId), eq(leadReviews.recipientId, leads.assignedUserId))),
    )).limit(1);
  return row;
}

export async function countPublicLeadReviews(recipientId: number) {
  const [row] = await db.select({ count: count() }).from(leadReviews).where(publicReviewsFor(recipientId));
  return row.count;
}

/** Public page and lifetime aggregate use the same predicate and database snapshot. */
export async function listPublicLeadReviews(recipientId: number, cursor?: ReviewCursor) {
  return db.transaction(async (tx) => {
    const where = publicReviewsFor(recipientId);
    // Rank only eligible reviews. A hidden or no-longer-public latest review falls back to that buyer's previous eligible one.
    const ranked = tx.select({
      rating: leadReviews.rating,
      position: sql<number>`row_number() over (partition by ${leadReviews.reviewerId} order by ${leadReviews.createdAt} desc, ${leadReviews.id} desc)`.as("buyer_position"),
    }).from(leadReviews).where(where).as("ranked_reviews");
    const [totals] = await tx.select({
      count: count(),
      buyerCount: sql<number>`count(*) filter (where ${ranked.position} = 1)`.mapWith(Number),
      average: sql<string | null>`avg(${ranked.rating}) filter (where ${ranked.position} = 1)`,
    }).from(ranked);
    const older = cursor ? sql`(${leadReviews.createdAt}, ${leadReviews.id}) < (${cursor.time}::timestamptz, ${cursor.id}::int)` : undefined;
    const rows = await tx.select({
      id: leadReviews.id, rating: leadReviews.rating, testimonial: leadReviews.testimonial,
      createdAt: leadReviews.createdAt,
      time: sql<string>`to_char(${leadReviews.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      reviewer: { username: users.username, displayName: users.displayName },
    }).from(leadReviews).innerJoin(users, eq(users.id, leadReviews.reviewerId))
      .where(and(where, older)).orderBy(desc(leadReviews.createdAt), desc(leadReviews.id)).limit(pageSize + 1);
    const last = rows[pageSize - 1];
    return {
      items: rows.slice(0, pageSize).map(({ id, rating, testimonial, createdAt, reviewer }) => ({ id, rating, testimonial, createdAt: createdAt.toISOString(), reviewer })),
      count: totals.count,
      buyerCount: totals.buyerCount,
      averageRating: totals.buyerCount < MIN_BUYERS_FOR_RATING || totals.average === null ? null : Number(totals.average),
      nextCursor: rows.length > pageSize ? `${last.time}:${last.id}` : null,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export type PublicLeadReviewsPage = Awaited<ReturnType<typeof listPublicLeadReviews>>;

export function isReviewParticipant(actorId: number, review: Pick<LeadReview, "reviewerId" | "recipientId">) {
  return actorId === review.reviewerId || actorId === review.recipientId;
}

/** Lead → review → reports, including for report decisions. Recheck after waiting for locks. */
export async function lockLeadReview(tx: Tx, id: number, publicOnly = false): Promise<LeadReview | undefined> {
  const where = and(eq(leadReviews.id, id), publicOnly ? visibleReview : undefined);
  const [lead] = await tx.select({ id: leads.id }).from(leadReviews).innerJoin(leads, eq(leads.id, leadReviews.leadId))
    .where(where).for("update", { of: leads });
  if (!lead) return undefined;
  const [review] = await tx.select().from(leadReviews).where(where).for("update");
  return review;
}

/** Caller has locked the review (and its lead) and checked staff scope. */
export async function recordLeadReviewDecision(tx: Tx, id: number, moderatorId: number, decision: ReviewDecision, reviewedAt = new Date()): Promise<ReviewResult> {
  const visibility = decision.action === "hide" ? "hidden" : "published";
  await tx.update(leadReviews).set({ visibility, reviewedById: moderatorId, reviewedAt, reviewNote: decision.reason }).where(eq(leadReviews.id, id));
  await tx.insert(leadReviewDecisions).values({ reviewId: id, moderatorId, ...decision, createdAt: reviewedAt });
  return { id, visibility };
}

const permittedFrom: Record<ReviewDecision["action"], ReviewVisibility[]> = {
  publish: ["pending_review"], hide: ["pending_review", "published"], restore: ["hidden"],
};

export async function moderateLeadReview(id: number, actorId: number, decision: ReviewDecision): Promise<ReviewResult> {
  return db.transaction(async (tx) => {
    const review = await lockLeadReview(tx, id);
    if (!review) throw reviewNotFound();
    if (isReviewParticipant(actorId, review)) throw new HttpError(403, "Another moderator must decide on a review you participated in.", "forbidden");
    if (!permittedFrom[decision.action].includes(review.visibility)) throw new HttpError(409, "Review status changed. Reload before deciding.", "review_conflict");
    if (decision.action !== "hide") {
      const [eligible] = await tx.select({ id: leadReviews.id }).from(leadReviews).where(and(eq(leadReviews.id, id), eligibleReviewEngagement));
      if (!eligible) throw notEligible();
    }
    const reviewedAt = new Date();
    const result = await recordLeadReviewDecision(tx, id, actorId, decision, reviewedAt);
    // Close the screening ticket when a moderator makes an explicit decision, but not community reports.
    await tx.update(reports).set({ status: decision.action === "hide" ? "approved" : "dismissed", reviewedAt, reviewedById: actorId })
      .where(and(eq(reports.targetType, "lead_review"), eq(reports.targetId, id), eq(reports.reason, "automated_filter"), eq(reports.status, "pending")));
    return result;
  });
}

const recipient = alias(users, "review_recipient");
/** Only the site-wide queue uses this query. No bid, lead content or intake joins. */
export async function listLeadReviewQueue(visibility: "pending_review" | "hidden") {
  return db.select({
    id: leadReviews.id, rating: leadReviews.rating, testimonial: leadReviews.testimonial,
    reviewerId: leadReviews.reviewerId, recipientId: leadReviews.recipientId, reviewer: users.username, recipient: recipient.username,
    reviewNote: leadReviews.reviewNote, eligible: sql<boolean>`${eligibleReviewEngagement}`,
  }).from(leadReviews).innerJoin(users, eq(users.id, leadReviews.reviewerId)).innerJoin(recipient, eq(recipient.id, leadReviews.recipientId))
    .where(eq(leadReviews.visibility, visibility)).orderBy(desc(leadReviews.createdAt), desc(leadReviews.id)).limit(25);
}

export type LeadReviewQueueItem = Awaited<ReturnType<typeof listLeadReviewQueue>>[number];

/** Only for the authorized site-wide queue. No stored risk score, reports, or automatic actions. */
export async function listLeadReviewSignals() {
  const winner = alias(users, "signal_winner");
  const activity = sql`greatest(${leads.awardedAt}, ${leads.completedAt}, ${leadReviews.createdAt})`;
  const rows = await db.select({
    leadId: leads.id, buyerId: leads.authorId, winnerId: leadBids.userId,
    buyer: users.username, winner: winner.username, awardedAt: leads.awardedAt, completedAt: leads.completedAt,
    review: { id: leadReviews.id, testimonial: leadReviews.testimonial },
  }).from(leads).innerJoin(leadBids, matchingLeadAward)
    .innerJoin(users, eq(leads.authorId, users.id)).innerJoin(winner, eq(leadBids.userId, winner.id))
    .leftJoin(leadReviews, and(eq(leadReviews.leadId, leads.id), eq(leadReviews.reviewerId, leads.authorId),
      eq(leadReviews.recipientId, leadBids.userId), explicitlyCompletedLead, inArray(leadReviews.visibility, ["published", "pending_review"])))
    .where(and(or(activeLeadAward, and(publicLead, explicitlyCompletedLead)), gte(activity, sql`now() - ${SIGNAL_WINDOW_DAYS}::integer * interval '1 day'`)))
    .orderBy(desc(activity), desc(leads.id)).limit(SIGNAL_SAMPLE_SIZE);
  return findLeadReviewSignals(rows);
}
