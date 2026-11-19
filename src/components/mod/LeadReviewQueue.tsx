import Link from "next/link";
import { isReviewParticipant, type LeadReviewQueueItem } from "@/lib/lead-reviews";
import { routes } from "@/lib/utils";
import { LeadReviewModeration } from "./LeadReviewModeration";

export function LeadReviewQueue({ pending, hidden, moderatorId }: {
  pending: LeadReviewQueueItem[]; hidden: LeadReviewQueueItem[]; moderatorId: number;
}) {
  const groups = [
    { key: "pending", label: "Awaiting moderation", empty: "No testimonials awaiting moderation.", rows: pending },
    { key: "hidden", label: "Hidden reviews", empty: "No hidden reviews.", rows: hidden },
  ] as const;
  return (
    <section aria-labelledby="lead-review-queue-heading" className="border-b border-line px-4 py-5 sm:px-6">
      <h2 id="lead-review-queue-heading" className="display text-[18px]">Engagement reviews</h2>
      <p className="mt-1 text-[13px] text-ink-3">Publish held testimonials, or restore a hidden review that should count again. These decisions don’t change the lead.</p>
      {groups.map(({ key, label, empty, rows }) => (
        <div key={key} className="mt-4">
          <h3 className="eyebrow mb-2">{label}</h3>
          {rows.length === 0 ? <p className="text-[13px] text-ink-3">{empty}</p> : (
            <ul className="divide-y divide-line rounded-md border border-line">
              {rows.map((row) => (
                <li key={row.id} className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
                    <span className="tag">Review #{row.id}</span>
                    <span className="num font-semibold text-ink">{row.rating} / 5</span>
                    <span>f/{row.reviewer} → <Link href={routes.profileReviews(row.recipient)} prefetch={false} className="font-semibold hover:underline">f/{row.recipient}</Link></span>
                  </div>
                  <p className="whitespace-pre-wrap text-[13px] [overflow-wrap:anywhere]">{row.testimonial}</p>
                  {row.reviewNote && <p className="whitespace-pre-wrap text-[12px] text-ink-3 [overflow-wrap:anywhere]">Last decision: {row.reviewNote}</p>}
                  {!row.eligible && <p className="text-[12px] text-ink-3">The lead is no longer publicly eligible.</p>}
                  {isReviewParticipant(moderatorId, row) ? <p className="text-[12px] text-ink-3">Another moderator must handle this review.</p> : (
                    <div className="flex flex-wrap gap-1">
                      {row.eligible && <LeadReviewModeration id={row.id} action={key === "hidden" ? "restore" : "publish"} />}
                      {key === "pending" && <LeadReviewModeration id={row.id} action="hide" />}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
