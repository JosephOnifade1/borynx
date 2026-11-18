import { BriefcaseBusiness, CalendarCheck, ExternalLink } from "lucide-react";
import { companyWebsite, type ProfilePreferences } from "@/lib/profile-input";
import type { PublicHiringCounts } from "@/lib/profile-leads";
import { cn, formatBudget } from "@/lib/utils";

export function ProfileSignals({ preferences, hiring }: { preferences: ProfilePreferences; hiring: PublicHiringCounts }) {
  const { lookingToHire, availableForWork, companyName, companyUrl, hourlyRate, hourlyCurrency } = preferences;
  const showHiring = lookingToHire || hiring.published > 0;
  if (!showHiring && !availableForWork) return null;
  const website = lookingToHire ? companyWebsite(companyUrl) : null;

  return (
    <div className={cn("mt-4 grid gap-3", showHiring && availableForWork && "sm:grid-cols-2")}>
      {showHiring && (
        <section aria-label="Hiring activity" className="min-w-0 rounded-md border border-line bg-sunken/60 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="eyebrow inline-flex items-center gap-1.5"><BriefcaseBusiness size={13} aria-hidden="true" /> Hiring</h2>
            {hiring.accepting > 0 ? <span className="tag tag-verdigris">Currently hiring</span> : lookingToHire && <span className="tag">Open to hiring</span>}
            {hiring.published === 1 && <span className="tag" title="One public listing">New Poster</span>}
          </div>
          {lookingToHire && companyName && <p className="mt-2 text-[14px] font-semibold [overflow-wrap:anywhere]">{companyName}</p>}
          {website && (
            <a href={website} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] text-verdigris hover:underline">
              Company website <ExternalLink size={11} aria-hidden="true" />
            </a>
          )}
          <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2" aria-label="Public hiring counts">
            {([
              ["Public leads", hiring.published],
              ["Accepting bids", hiring.accepting],
              ["Completed", hiring.completed],
            ] as const).map(([label, count]) => (
              <div key={label}>
                <dt className="text-[11.5px] text-ink-3">{label}</dt>
                <dd className="num text-[16px] font-semibold">{count.toLocaleString("en-US")}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {availableForWork && (
        <section aria-label="Freelance availability" className="min-w-0 rounded-md border border-line bg-sunken/60 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="eyebrow inline-flex items-center gap-1.5"><CalendarCheck size={13} aria-hidden="true" /> Freelance</h2>
            <span className="tag tag-verdigris">Available for work</span>
          </div>
          {hourlyRate !== null && hourlyCurrency !== null && (
            <dl className="mt-3 border-t border-line pt-2">
              <dt className="text-[12px] text-ink-3">Hourly rate</dt>
              <dd className="num mt-0.5 text-[16px] font-semibold">{formatBudget(hourlyRate, hourlyRate, hourlyCurrency, "hourly")}</dd>
            </dl>
          )}
        </section>
      )}
    </div>
  );
}
