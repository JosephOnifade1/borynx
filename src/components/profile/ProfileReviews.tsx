import { Star } from "lucide-react";
import Link from "next/link";
import { LeadReviewModeration } from "@/components/mod/LeadReviewModeration";
import { ReportButton } from "@/components/shell/ReportModal";
import type { PublicLeadReviewsPage } from "@/lib/lead-reviews";
import { routes } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export function ProfileReviews({ page, username, staffUsername, paged, invalidCursor }: {
  page: PublicLeadReviewsPage; username: string; staffUsername?: string; paged: boolean; invalidCursor: boolean;
}) {
  const { items, count, averageRating, nextCursor } = page;
  return (
    <section id="profile-reviews" aria-labelledby="profile-reviews-heading" className="scroll-mt-24 space-y-3">
      <header className="panel rounded-lg px-4 py-4 sm:px-5">
        <h2 id="profile-reviews-heading" className="display text-[18px]">Engagement reviews</h2>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {averageRating !== null && <span className="num text-[20px] font-semibold">{averageRating.toFixed(1)} / 5</span>}
          <span className="text-[13px] text-ink-3"><span className="num">{count}</span> {count === 1 ? "review" : "reviews"}</span>
        </div>
        <p className="mt-1 text-[13px] text-ink-3">Only buyers who marked an awarded lead complete can leave a review. This doesn’t verify payment or identity.</p>
        {invalidCursor && <p className="mt-2 text-[13px] text-ink-3">That page link was invalid. You’re viewing the newest reviews.</p>}
      </header>
      {items.length > 0 ? (
        <ol className="space-y-2.5">
          {items.map((item) => (
            <li key={item.id} className="panel rounded-lg px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="num inline-flex items-center gap-1.5 text-[14px] font-semibold"><Star size={14} className="text-gold" aria-hidden="true" />{item.rating} / 5</span>
                <span className="text-[12px] font-medium text-ink-3">From a completed Borynx lead</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-2 [overflow-wrap:anywhere]">{item.testimonial}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-t border-line pt-2.5">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px] [overflow-wrap:anywhere]">
                  <Link prefetch={false} href={routes.profile(item.reviewer.username)} className="font-semibold hover:underline">{item.reviewer.displayName} <span className="num font-normal text-ink-3">f/{item.reviewer.username}</span></Link>
                  <time className="num text-ink-3" dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time>
                </div>
                <div className="flex flex-wrap gap-1">
                  <ReportButton target={{ type: "lead_review", id: item.id, label: `Review by ${item.reviewer.displayName}` }} />
                  {staffUsername && staffUsername !== username && staffUsername !== item.reviewer.username && <LeadReviewModeration id={item.id} action="hide" />}
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="panel rounded-lg px-4 py-6 text-center text-[13px] text-ink-3">{paged ? "No more reviews on this page." : "No published engagement reviews yet."}</p>}
      {(paged || nextCursor) && (
        <nav aria-label="Review pages" className="flex flex-wrap justify-end gap-2">
          {paged && <Link prefetch={false} className="btn" href={`${routes.profileReviews(username)}#profile-reviews`}>Newest reviews</Link>}
          {nextCursor && <Link prefetch={false} className="btn" href={`${routes.profileReviews(username, nextCursor)}#profile-reviews`}>Older reviews</Link>}
        </nav>
      )}
    </section>
  );
}
