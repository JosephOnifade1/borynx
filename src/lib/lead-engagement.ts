import type { Lead, LeadBid } from "@/db/schema";
import { HttpError } from "./errors";
import { leadBody, MAX_LEAD_BUDGET } from "./lead-input";

export const MAX_BID_AMOUNT = MAX_LEAD_BUDGET;
export const LEAD_ACTIONS = ["close_without_hire", "complete", "cancel", "withdraw"] as const;
export type LeadAction = (typeof LEAD_ACTIONS)[number];
type Engagement = Pick<Lead, "status" | "awardNeedsReview" | "acceptedBidId" | "assignedUserId">;

export function parseBidInput(value: unknown): { amount: number; message: string } {
  const body = leadBody(value);
  const { amount } = body;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1 || amount > MAX_BID_AMOUNT) {
    const message = `Enter a whole quote between 1 and ${MAX_BID_AMOUNT.toLocaleString("en-US")}.`;
    throw new HttpError(422, message, "invalid_bid", { amount: message });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length < 20 || message.length > 4_000 || message.includes("\0")) {
    const error = "Write a pitch of 20–4,000 characters.";
    throw new HttpError(422, error, "invalid_bid", { message: error });
  }
  return { amount, message };
}

export function parseLeadAction(value: unknown): LeadAction {
  const { action } = leadBody(value);
  if (typeof action !== "string" || !LEAD_ACTIONS.some((choice) => choice === action)) {
    throw new HttpError(422, "Choose a valid lead action.", "invalid_action");
  }
  return action as LeadAction;
}

export function hasNoAward(lead: Engagement): boolean {
  return !lead.awardNeedsReview && lead.acceptedBidId === null && lead.assignedUserId === null;
}

/** Old `in_review` listings can still choose a winner, but cannot receive new pitches. */
export function canSelectBid(lead: Engagement): boolean {
  return hasNoAward(lead) && (lead.status === "open" || lead.status === "in_review");
}

export function matchesLeadAward(lead: Engagement & Pick<Lead, "id" | "authorId">, bid: Pick<LeadBid, "id" | "leadId" | "userId" | "isAccepted"> | undefined): boolean {
  return Boolean(!lead.awardNeedsReview && bid && bid.id === lead.acceptedBidId && bid.leadId === lead.id &&
    bid.userId === lead.assignedUserId && bid.userId !== lead.authorId && bid.isAccepted);
}

export const ENGAGEMENT_LABELS = {
  open: { label: "Open", tone: "tag-ember" },
  in_review: { label: "Reviewing pitches", tone: "tag-gold" },
  deadline_passed: { label: "Deadline passed", tone: "tag-gold" },
  awarded: { label: "Awarded", tone: "tag-gold" },
  completed: { label: "Completed", tone: "tag-success" },
  closed: { label: "Closed without hire", tone: "" },
  cancelled: { label: "Cancelled", tone: "tag-danger" },
  unavailable: { label: "Not accepting bids", tone: "" },
} as const;

export type LeadEngagementLabel = keyof typeof ENGAGEMENT_LABELS;

export function getLeadEngagement(lead: Engagement & Pick<Lead, "deadlineAt">, now = Date.now()): LeadEngagementLabel {
  if (lead.awardNeedsReview || ((lead.status === "open" || lead.status === "in_review" || lead.status === "closed") && !hasNoAward(lead))) return "unavailable";
  if (lead.status === "open" && lead.deadlineAt && lead.deadlineAt.getTime() <= now) return "deadline_passed";
  return lead.status;
}
