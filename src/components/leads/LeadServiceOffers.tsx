import Link from "next/link";
import { getSession, isSuspended } from "@/lib/auth";
import { formatServiceFee, LEAD_SERVICE_LABEL, SPONSOR_DAYS, type LeadServiceKind } from "@/lib/lead-service-input";
import { leadServicePrice } from "@/lib/lead-service-policy";
import { buyerLeadServices } from "@/lib/lead-services";
import { routes } from "@/lib/utils";
import { RequestLeadService } from "./LeadServiceActions";

const descriptions: Record<LeadServiceKind, string> = {
  assisted_hire: "Get a shortlist of 2–3 available, budget-fit freelancers within two business days of confirmed payment. If we miss the agreed shortlist, we refund the service fee. A hire is not guaranteed.",
  sponsored_lead: `Get up to ${SPONSOR_DAYS} days in one labeled slot on the Leads board, subject to availability and while your lead is accepting pitches. This doesn’t affect organic ranking or reputation. We refund the fee if we can’t deliver the agreed placement for an eligible lead. If your lead stops accepting pitches, display ends without an automatic refund. A hire is not guaranteed.`,
};

export async function LeadServiceOffers({ leadId, ownerId }: { leadId: number; ownerId: number }) {
  const options = (Object.keys(LEAD_SERVICE_LABEL) as LeadServiceKind[]).flatMap((kind) => {
    const price = leadServicePrice(kind);
    return price === null ? [] : [{ kind, price }];
  });
  if (!options.length) return null;
  const session = await getSession();
  if (session?.kind !== "email" || session.user.id !== ownerId || isSuspended(session.user)) return null;
  const existing = new Map((await buyerLeadServices(ownerId, leadId)).map((order) => [order.kind, order]));
  return (
    <section id="buyer-services" aria-labelledby="buyer-services-heading" className="space-y-3 border-t border-line px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="eyebrow">Private to you · optional</p><h2 id="buyer-services-heading" className="display mt-1 text-[18px]">Hiring services</h2></div>
        <Link href={routes.leadServices()} className="btn btn-sm" prefetch={false}>My requests</Link>
      </div>
      <p className="text-[13px] text-ink-2">Posting, applying, and hiring remain free. Requesting a service lets the Borynx pilot team contact you at your confirmed email. You won’t be charged here.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map(({ kind, price }) => {
          const order = existing.get(kind);
          return (
            <div key={kind} className="flex min-w-0 flex-col gap-3 rounded-md border border-line bg-sunken/30 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{LEAD_SERVICE_LABEL[kind]}</h3>
                <span className="num font-semibold text-ember">{formatServiceFee(order?.amountMinor ?? price)}</span>
              </div>
              <p className="flex-1 text-[13px] text-ink-2">{descriptions[kind]}</p>
              {order ? <Link href={routes.leadServices()} prefetch={false} className="btn self-start">View request</Link> : <RequestLeadService leadId={leadId} kind={kind} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
