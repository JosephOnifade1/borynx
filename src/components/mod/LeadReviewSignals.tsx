import Link from "next/link";
import { RAPID_COMPLETION_HOURS, SIGNAL_SAMPLE_SIZE, SIGNAL_WINDOW_DAYS, type LeadReviewSignalMatch } from "@/lib/lead-review-signals";
import { routes } from "@/lib/utils";

function LeadLink({ id }: { id: number }) {
  return <Link href={routes.leadSubmission(id)} prefetch={false} className="font-semibold hover:underline">Lead #{id}</Link>;
}

export function LeadReviewSignals({ matches }: { matches: LeadReviewSignalMatch[] }) {
  return (
    <section aria-labelledby="engagement-signals-heading" className="border-b border-line px-4 py-5 sm:px-6">
      <h2 id="engagement-signals-heading" className="display text-[18px]">Engagement signals</h2>
      <p className="mt-1 text-[13px] text-ink-3">Advisory only, not evidence of misconduct. Check the briefs, dates, and context before making a decision. These signals never change review visibility, ratings, or account access.</p>
      <p className="mt-1 text-[12px] text-ink-3">Sample: up to {SIGNAL_SAMPLE_SIZE} public awards with activity in the last {SIGNAL_WINDOW_DAYS} days.</p>
      {matches.length === 0 ? <p className="mt-3 text-[13px] text-ink-3">No signals in this sample.</p> : (
        <details className="mt-3 rounded-md border border-line">
          <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium">Inspect {matches.length} {matches.length === 1 ? "lead" : "leads"}</summary>
          <ul className="divide-y divide-line border-t border-line">
            {matches.map((match) => (
              <li key={match.leadId} className="space-y-1.5 p-3 text-[13px]">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 [overflow-wrap:anywhere]">
                  <LeadLink id={match.leadId} />
                  <span className="text-ink-3">f/{match.buyer} → <Link href={routes.profileReviews(match.winner)} prefetch={false} className="hover:underline">f/{match.winner}</Link></span>
                  {match.reviewId !== null && <span className="num text-ink-3">Review #{match.reviewId}</span>}
                </div>
                <ul className="list-disc space-y-1 pl-4 text-ink-2">
                  {match.signals.map((signal) => <li key={signal.kind}>{signal.kind === "rapid_completion" ? `Buyer marked complete within ${RAPID_COMPLETION_HOURS} hours of award.`
                    : signal.kind === "reciprocal_award" ? <>Reciprocal award with <LeadLink id={signal.relatedLeadId} />.</>
                      : <>Similar testimonial to review #{signal.relatedReviewId} on <LeadLink id={signal.relatedLeadId} />.</>}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
