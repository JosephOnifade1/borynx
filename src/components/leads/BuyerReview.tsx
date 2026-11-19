"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { api, ClientError } from "@/lib/client";
import { HttpError } from "@/lib/errors";
import { parseReviewInput, REVIEW_LIMITS, REVIEW_RATINGS, type ReviewInput, type ReviewResult, type ReviewVisibility } from "@/lib/lead-review-input";
import { routes } from "@/lib/utils";

export function BuyerReview({ leadId, username, displayName, visibility }: {
  leadId: number; username: string; displayName: string; visibility: ReviewVisibility | null;
}) {
  const prefix = useId();
  const router = useRouter();
  const [issue, setIssue] = useState<{ message: string; fields?: Record<string, string> } | null>(null);
  const review = useMutation({
    mutationFn: (input: ReviewInput) => api<ReviewResult>(`/api/leads/${leadId}/review`, { method: "POST", json: input }),
    onSuccess: () => router.refresh(),
    onError: (error) => {
      setIssue({ message: error.message, fields: error instanceof ClientError ? error.fields : undefined });
      if (error instanceof ClientError && error.code === "review_exists") router.refresh();
    },
  });
  const state = visibility ?? review.data?.visibility;

  return (
    <section id="review" aria-labelledby={`${prefix}-heading`} className="scroll-mt-24 border-t border-line px-4 py-5 sm:px-6">
      <h2 id={`${prefix}-heading`} className="display text-[17px]">{state ? "Your review" : "Leave a review"}</h2>
      <div role="status" className="text-[13px] text-ink-2">
        {state === "pending_review" && <p className="mt-2">Review submitted. It won’t appear on the winner’s profile until a moderator publishes it.</p>}
        {state === "hidden" && <p className="mt-2">Your review is hidden and doesn’t count toward the profile rating.</p>}
        {state === "published" && <p className="mt-2">Review published on <Link prefetch={false} className="font-semibold text-ember hover:underline" href={routes.profileReviews(username)}>{displayName}’s profile</Link>.</p>}
      </div>
      {!state && (
        <form className="mt-2" aria-labelledby={`${prefix}-heading`} onChange={() => setIssue(null)} onSubmit={(event) => {
          event.preventDefault();
          if (review.isPending) return;
          setIssue(null);
          const data = new FormData(event.currentTarget);
          try {
            review.mutate(parseReviewInput({ rating: Number(data.get("rating")), testimonial: data.get("testimonial") }));
          } catch (error) {
            setIssue({ message: error instanceof Error ? error.message : "Check your review.", fields: error instanceof HttpError ? error.fields : undefined });
          }
        }}>
          <p id={`${prefix}-public`} className="mb-3 text-[13px] text-ink-3">
            Your rating and testimonial for <strong>{displayName}</strong> will be public. Don’t include private pitch, payment, or contact details. You can submit only once.
          </p>
          <fieldset aria-label="Review details" className="min-w-0 space-y-3" disabled={review.isPending}>
            <fieldset className="min-w-0" aria-invalid={issue?.fields?.rating ? true : undefined} aria-describedby={issue?.fields?.rating ? `${prefix}-error` : undefined}>
              <legend className="eyebrow mb-2">Rating out of 5</legend>
              <div className="flex flex-wrap gap-1.5">
                {REVIEW_RATINGS.map((rating) => (
                  <label key={rating} className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-md border border-line px-1.5 hover:border-line-strong has-checked:border-ember has-checked:bg-ember-soft/40">
                    <input type="radio" name="rating" value={rating} required className="accent-[var(--ember)]" />
                    <span className="num text-[13px]">{rating}<span className="sr-only"> {rating === 1 ? "star" : "stars"}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block">
              <span className="eyebrow">Testimonial</span>
              <textarea name="testimonial" rows={4} required minLength={REVIEW_LIMITS.min} maxLength={REVIEW_LIMITS.max * 2}
                aria-describedby={`${prefix}-public ${prefix}-length${issue?.fields?.testimonial ? ` ${prefix}-error` : ""}`}
                aria-invalid={issue?.fields?.testimonial ? true : undefined} className="field mt-1.5" />
            </label>
            <p id={`${prefix}-length`} className="text-[12px] text-ink-3">20–2,000 characters, plain text.</p>
            {issue && <p role="alert" id={`${prefix}-error`} className="text-[13px] text-danger">{issue.message}</p>}
            <button type="submit" className="btn btn-primary">{review.isPending ? "Submitting…" : "Submit review"}</button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
