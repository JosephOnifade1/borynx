import type { LeadReview } from "@/db/schema";
import { HttpError } from "./errors";

export const REVIEW_LIMITS = { min: 20, max: 2_000, reason: 500 } as const;
export const REVIEW_RATINGS = [1, 2, 3, 4, 5] as const;
export const REVIEW_ACTIONS = ["publish", "hide", "restore"] as const;
export type ReviewVisibility = LeadReview["visibility"];
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];
export type ReviewDecision = { action: ReviewAction; reason: string };
export type ReviewInput = { rating: (typeof REVIEW_RATINGS)[number]; testimonial: string };
export type ReviewResult = { id: number; visibility: ReviewVisibility };
export type ReviewCursor = { time: string; id: number };

export const REVIEW_VISIBILITY_LABELS: Record<ReviewVisibility, string> = {
  published: "Published", pending_review: "Awaiting moderation", hidden: "Hidden",
};

function invalid(field: string, message: string): never {
  throw new HttpError(422, message, "invalid_review", { [field]: message });
}

function reviewBody(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Expected a JSON object", "bad_request");
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new HttpError(422, "Unexpected review fields", "invalid_review");
  }
  return value as Record<string, unknown>;
}

function reviewText(value: unknown, field: "testimonial" | "reason", min: number, max: number) {
  const text = typeof value === "string" ? value.trim() : "";
  // Count Unicode code points like Postgres length(), not UTF-16 code units.
  const count = text.length <= max * 2 ? [...text].length : max + 1;
  if (count < min || count > max) invalid(field, `Enter ${min}–${max.toLocaleString("en-US")} characters.`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uD800-\uDFFF]/u.test(text)) invalid(field, "This text contains an unsupported character.");
  return text;
}

export function parseReviewInput(value: unknown): ReviewInput {
  const body = reviewBody(value, ["rating", "testimonial"]);
  const rating = REVIEW_RATINGS.find((choice) => choice === body.rating);
  if (rating === undefined) invalid("rating", "Choose a whole rating from 1 to 5.");
  return { rating, testimonial: reviewText(body.testimonial, "testimonial", REVIEW_LIMITS.min, REVIEW_LIMITS.max) };
}

export function parseReviewDecision(value: unknown): ReviewDecision {
  const body = reviewBody(value, ["action", "reason"]);
  const action = REVIEW_ACTIONS.find((choice) => choice === body.action);
  if (action === undefined) invalid("action", "Choose a valid moderation action.");
  return { action, reason: reviewText(body.reason, "reason", 1, REVIEW_LIMITS.reason) };
}

export function parseReviewId(value: string | undefined): number {
  if (value && /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2_147_483_647) return Number(value);
  throw new HttpError(400, "Invalid review ID", "bad_request");
}

/** Seek by the full PostgreSQL timestamp and ID, even when several reviews share a millisecond. */
export function parseReviewCursor(value: string | string[] | undefined): ReviewCursor | undefined {
  if (value === undefined) return undefined;
  const match = typeof value === "string" && value.length <= 38
    ? /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z):([1-9]\d{0,9})$/.exec(value) : null;
  if (match && !match[1].startsWith("0000") && Number(match[2]) <= 2_147_483_647) {
    const time = match[1];
    const date = new Date(time);
    if (Number.isFinite(date.getTime()) && date.toISOString() === `${time.slice(0, 23)}Z`) return { time, id: Number(match[2]) };
  }
  throw new HttpError(400, "Invalid review cursor. Start again from the first page.", "invalid_cursor");
}
