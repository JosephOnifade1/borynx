import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ManageLeadService } from "@/components/leads/LeadServiceActions";
import { PageFrame, PageHeader } from "@/components/PageFrame";
import { getSession, isSuspended } from "@/lib/auth";
import { assistedDueDate, formatServiceFee, LEAD_SERVICE_LABEL, serviceStateLabel, type LeadServiceAction } from "@/lib/lead-service-input";
import { leadServicePrice } from "@/lib/lead-service-policy";
import { buyerLeadServices, isSponsoredSlotReserved, leadServiceQueue } from "@/lib/lead-services";
import { routes } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hiring service requests", robots: { index: false, follow: false } };

type Order = Awaited<ReturnType<typeof buyerLeadServices>>[number];
const dateOnly = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone: "UTC" });
const dateTime = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });

function OrderSummary({ order }: { order: Order }) {
  const due = order.kind === "assisted_hire" && order.state === "confirmed" && order.confirmedAt ? assistedDueDate(order.confirmedAt) : null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="tag tag-ember">{LEAD_SERVICE_LABEL[order.kind]}</span>
        <span className="num text-[13px] font-semibold">{formatServiceFee(order.amountMinor)}</span>
        <span className="text-[12px] text-ink-3">Request #{order.id}</span>
      </div>
      <h3 className="mt-2 break-words text-[15px] font-semibold">{order.title || `Lead #${order.leadId}`}</h3>
      <p className="mt-1 text-[13px] text-ink-2">{serviceStateLabel(order.kind, order.state, order.sponsorUntil)}.</p>
      {due && <p className="mt-1 text-[13px]">Shortlist due: <time dateTime={due}>{dateOnly.format(new Date(due))}</time> (Lagos).</p>}
      {order.state === "confirmed" && order.sponsorUntil && <p className="mt-1 text-[13px]">Placement ends <time dateTime={order.sponsorUntil.toISOString()}>{dateTime.format(order.sponsorUntil)} WAT</time>. Only eligible open leads appear on the board.</p>}
    </>
  );
}

export default async function LeadServicesPage() {
  const session = await getSession();
  if (!session) redirect(`${routes.login()}?next=${encodeURIComponent(routes.leadServices())}`);
  if (session.kind !== "email") notFound();
  const canOperate = session.user.role === "admin" && !isSuspended(session.user);
  const [orders, queue, reserved] = await Promise.all([
    buyerLeadServices(session.user.id),
    canOperate ? leadServiceQueue(session.user.id) : [],
    canOperate ? isSponsoredSlotReserved() : false,
  ]);
  return (
    <PageFrame header={<PageHeader eyebrow="Marketplace · private" title="Hiring service requests" description="Track optional services here. Payments, shortlists, and refunds are handled separately by the Borynx pilot team." actions={<Link href={routes.leads()} className="btn">Back to Leads</Link>} />}>
      <section aria-labelledby="my-requests-heading" className="space-y-3 px-4 py-5 sm:px-6">
        <h2 id="my-requests-heading" className="display text-[18px]">My requests</h2>
        {orders.length ? <ul className="space-y-2">{orders.map((order) => (
          <li key={order.id} className="rounded-md border border-line p-3.5"><OrderSummary order={order} /></li>
        ))}</ul> : <p className="text-[13px] text-ink-3">No requests yet. When the pilot is open, you can request a service from your approved open lead.</p>}
      </section>
      {canOperate && (
        <section aria-labelledby="service-queue-heading" className="space-y-3 border-t border-line px-4 py-5 sm:px-6">
          <h2 id="service-queue-heading" className="display text-[18px]">Pilot operations</h2>
          <p className="text-[13px] text-ink-2">Agree the terms by email and verify payment before recording it here. Deliver the shortlist or send the refund separately first. These controls never move money.</p>
          <p className="text-[13px] font-medium">Sponsored slot: {reserved ? "Reserved — don’t invoice another placement yet." : "Unreserved. Check that the lead is still eligible before invoicing."}</p>
          {queue.length ? <ul className="space-y-2">{queue.map((order) => {
            const actions: LeadServiceAction[] = [];
            const canConfirm = order.eligible && order.contact && leadServicePrice(order.kind) !== null && (order.kind !== "sponsored_lead" || !reserved);
            if (order.state === "requested") {
              if (canConfirm) actions.push("confirm_payment");
              actions.push("decline");
            }
            if (order.state === "confirmed" && order.kind === "assisted_hire") actions.push("deliver");
            if (order.state === "confirmed" || order.state === "delivered") actions.push("record_refund");
            return <li key={order.id} className="rounded-md border border-line p-3.5">
              <OrderSummary order={order} />
              <p className="mt-2 break-all text-[12px] text-ink-2">f/{order.buyer}{order.contact && <> · {order.contact}</>}</p>
              {order.state === "requested" && !canConfirm && <p className="mt-2 text-[13px] text-ink-3">Not ready for payment confirmation. Check lead eligibility, contact, and slot availability.</p>}
              {actions.length > 0 && <ManageLeadService key={`${order.id}:${order.state}`} orderId={order.id} actions={actions} />}
            </li>;
          })}</ul> : <p className="text-[13px] text-ink-3">No requests from other buyers.</p>}
        </section>
      )}
    </PageFrame>
  );
}
