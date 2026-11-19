"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import type { LeadAction } from "@/lib/lead-engagement";

type Outcome = Exclude<LeadAction, "withdraw">;
const OUTCOMES = {
  close_without_hire: { label: "Close without hire", confirm: "Confirm close", note: "No winner will be selected. This lead cannot be reopened." },
  complete: { label: "Mark complete", confirm: "Confirm completion", note: "Mark this lead complete. This does not verify work or payment." },
  cancel: { label: "Cancel engagement", confirm: "Confirm cancellation", note: "Cancel the engagement without marking it complete. The original award stays on record, and bidding will not reopen." },
} satisfies Record<Outcome, { label: string; confirm: string; note: string }>;

export function LeadOutcomeControls({ leadId, awarded }: { leadId: number; awarded: boolean }) {
  const router = useRouter();
  const query = useQueryClient();
  const [selected, setSelected] = useState<Outcome | null>(null);
  const actions: Outcome[] = awarded ? ["complete", "cancel"] : ["close_without_hire"];
  const outcome = useMutation({
    mutationFn: (action: Outcome) => api(`/api/leads/${leadId}/status`, { method: "PATCH", json: { action } }),
    onSuccess: () => {
      void query.invalidateQueries({ queryKey: ["leads"] });
      router.refresh();
    },
  });
  const locked = outcome.isPending || outcome.isSuccess;
  return (
    <div className="rounded-md border border-line bg-sunken/40 p-3.5">
      <p className="eyebrow">Buyer actions</p>
      {selected ? (
        <>
          <p className="mt-2 text-[13px] text-ink-2">{OUTCOMES[selected].note}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={locked} onClick={() => outcome.mutate(selected)}>{locked ? "Saving…" : OUTCOMES[selected].confirm}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={locked} onClick={() => { outcome.reset(); setSelected(null); }}>Go back</button>
          </div>
        </>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {actions.map((action) => (
            <button key={action} type="button" className={`btn btn-sm ${action === "complete" ? "btn-primary" : action === "cancel" ? "text-danger" : ""}`}
              onClick={() => setSelected(action)}>{OUTCOMES[action].label}</button>
          ))}
        </div>
      )}
      {outcome.isError && <p role="alert" className="mt-2 text-[13px] text-danger">{outcome.error.message}</p>}
    </div>
  );
}

export function AwardBidButton({ leadId, bidId, bidderName }: { leadId: number; bidId: number; bidderName: string }) {
  const router = useRouter();
  const query = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const award = useMutation({
    mutationFn: () => api(`/api/leads/${leadId}/bids/${bidId}/accept`, { method: "POST" }),
    onSuccess: () => {
      void query.invalidateQueries({ queryKey: ["leads"] });
      router.refresh();
    },
  });
  const locked = award.isPending || award.isSuccess;
  return confirming ? (
    <div className="mt-2.5 rounded-md border border-line px-3 py-2.5">
      <p className="text-[13px] text-ink-2">Award this lead to <strong>{bidderName}</strong>? You can only select one winner.</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-sm" disabled={locked} onClick={() => award.mutate()}>{locked ? "Awarding…" : "Confirm award"}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={locked} onClick={() => { award.reset(); setConfirming(false); }}>Go back</button>
      </div>
      {award.isError && <p role="alert" className="mt-2 text-[13px] text-danger">{award.error.message}</p>}
    </div>
  ) : <button type="button" className="btn btn-sm mt-2.5" aria-label={`Award lead to ${bidderName}`} onClick={() => setConfirming(true)}>Award lead</button>;
}
