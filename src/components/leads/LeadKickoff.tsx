import { LockKeyhole } from "lucide-react";
import type { getLeadKickoff } from "@/lib/lead-kickoff";
import { KickoffAcknowledge, KickoffComposer, KickoffRefresh } from "./LeadKickoffActions";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export function LeadKickoff({ leadId, kickoff }: { leadId: number; kickoff: NonNullable<Awaited<ReturnType<typeof getLeadKickoff>>> }) {
  const { role, details } = kickoff;
  const acknowledged = Boolean(details?.acknowledgedAt);
  return (
    <section id="kickoff" tabIndex={-1} className="scroll-mt-24 border-t border-line px-4 py-5 sm:px-6" aria-labelledby="kickoff-heading">
      <div className="rounded-lg border border-line bg-sunken/35 p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="kickoff-heading" className="display inline-flex items-center gap-2 text-[17px]"><LockKeyhole size={15} aria-hidden="true" /> Private kickoff</h2>
          <span className={`tag ${acknowledged ? "tag-success" : details ? "tag-verdigris" : "tag-gold"}`}>
            {acknowledged ? "Acknowledged" : details ? "Details sent" : "Waiting for details"}
          </span>
        </div>
        {!details ? role === "buyer" ? (
          <>
            <p className="mt-2 text-[13px] text-ink-2">Send the winner a first step, a proposed start date, and a way to reach you. Only you and the winner can see these details.</p>
            <KickoffComposer leadId={leadId} />
          </>
        ) : (
          <>
            <p className="mt-2 text-[13px] text-ink-2"><strong>You won — waiting for kickoff details.</strong> We’ll notify you here when the buyer sends them.</p>
            <KickoffRefresh />
          </>
        ) : (
          <>
            <p className="mt-2 text-[13px] text-ink-2" role="status">
              {acknowledged ? "Kickoff acknowledged. The lead is still Awarded." : role === "buyer" ? "Waiting for the winner to acknowledge these details." : "The buyer shared these details with you."}
            </p>
            <dl className="mt-3 space-y-2.5 rounded-md border border-line bg-bg p-3 text-[13px] [overflow-wrap:anywhere]">
              <div>
                <dt className="eyebrow">Kickoff note</dt>
                <dd className="mt-1 whitespace-pre-wrap text-ink-2">{details.note}</dd>
              </div>
              <div>
                <dt className="eyebrow">Proposed start date</dt>
                <dd className="num mt-1"><time dateTime={details.startDate}>{dateFormat.format(new Date(`${details.startDate}T00:00:00.000Z`))}</time></dd>
              </div>
              <div>
                <dt className="eyebrow">Contact shared by the buyer</dt>
                <dd className="mt-1 select-text text-ink-2">{details.contact}</dd>
              </div>
            </dl>
            {!acknowledged && (role === "winner" ? <KickoffAcknowledge leadId={leadId} /> : <KickoffRefresh />)}
            <p className="mt-2.5 text-[12px] text-ink-3">These details are only available here while the lead is Awarded.</p>
          </>
        )}
      </div>
    </section>
  );
}
