"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { LEAD_SERVICE_ACTION_LABEL, LEAD_SERVICE_LABEL, type LeadServiceAction, type LeadServiceKind } from "@/lib/lead-service-input";

function useServiceWrite() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  async function write(path: string, method: "POST" | "PATCH", json: Record<string, unknown>) {
    if (pending || saved) return;
    setPending(true);
    setIssue(null);
    try {
      await api(path, { method, json });
      setSaved(true);
      router.refresh();
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "We couldn’t save that change.");
    } finally {
      setPending(false);
    }
  }
  return { pending, saved, issue, write };
}

export function RequestLeadService({ leadId, kind }: { leadId: number; kind: LeadServiceKind }) {
  const { pending, saved, issue, write } = useServiceWrite();
  if (saved) return <p role="status" className="text-[13px] text-ink-2">Request sent. No payment taken.</p>;
  return (
    <div className="space-y-2">
      <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void write(`/api/leads/${leadId}/services`, "POST", { kind, contactConsent: true })}>
        {pending ? "Sending request…" : `Request ${LEAD_SERVICE_LABEL[kind]}`}
      </button>
      {issue && <p role="alert" className="text-[13px] text-danger">{issue}</p>}
    </div>
  );
}

export function ManageLeadService({ orderId, actions }: { orderId: number; actions: LeadServiceAction[] }) {
  const { pending, saved, issue, write } = useServiceWrite();
  async function act(action: LeadServiceAction) {
    const confirmation = action === "confirm_payment" ? "Record the payment you have already verified outside Borynx? This does not charge the buyer."
      : action === "record_refund" ? "Record a refund that has already been sent outside Borynx? This does not issue a refund."
        : action === "deliver" ? "Confirm the agreed shortlist has already been sent to the buyer?" : "Decline this request?";
    if (window.confirm(confirmation)) await write(`/api/mod/lead-services/${orderId}`, "PATCH", { action });
  }
  return (
    <div className="mt-3 space-y-2">
      {saved ? <p role="status" className="text-[13px] text-ink-2">Service status updated.</p> : (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => <button key={action} type="button" className={`btn btn-sm ${action === "confirm_payment" ? "btn-primary" : ""}`} disabled={pending} onClick={() => void act(action)}>{LEAD_SERVICE_ACTION_LABEL[action]}</button>)}
        </div>
      )}
      {issue && <p role="alert" className="text-[13px] text-danger">{issue}</p>}
    </div>
  );
}
