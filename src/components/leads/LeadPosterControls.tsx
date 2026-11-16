"use client";

import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientError } from "@/lib/client";
import type { Lead } from "@/db/schema";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

interface LeadStatusSelectorProps {
  leadId: number;
  currentStatus: Lead["status"];
  className?: string;
}

export function LeadStatusSelector({
  leadId,
  currentStatus,
  className,
}: LeadStatusSelectorProps) {
  const router = useRouter();
  const notify = useUiStore((s) => s.notify);
  const [status, setStatus] = useState<Lead["status"]>(currentStatus);

  const mutation = useMutation({
    mutationFn: (newStatus: Lead["status"]) =>
      api<{ ok: boolean; status: Lead["status"] }>(`/api/leads/${leadId}/status`, {
        method: "PATCH",
        json: { status: newStatus },
      }),
    onSuccess: (data) => {
      setStatus(data.status);
      notify(`Lead status updated to ${data.status.replace("_", " ")}`, "success");
      router.refresh();
    },
    onError: (err) => {
      notify(err instanceof ClientError ? err.message : "Failed to update status", "error");
    },
  });

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <span className="eyebrow text-ink-3">Status:</span>
      <select
        value={status}
        disabled={mutation.isPending}
        onChange={(e) => {
          const s = e.target.value as Lead["status"];
          setStatus(s);
          mutation.mutate(s);
        }}
        className="field h-8 py-0 pl-2 pr-7 text-[12.5px] font-medium"
      >
        <option value="open">Open (Accepting bids)</option>
        <option value="in_review">In Review</option>
        <option value="closed">Closed / Awarded</option>
      </select>
    </div>
  );
}

interface AcceptBidButtonProps {
  leadId: number;
  bidId: number;
  freelancerName: string;
  isAccepted: boolean;
}

export function AcceptBidButton({
  leadId,
  bidId,
  freelancerName,
  isAccepted,
}: AcceptBidButtonProps) {
  const router = useRouter();
  const notify = useUiStore((s) => s.notify);
  const [confirming, setConfirming] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      api<{ ok: boolean }>(`/api/leads/${leadId}/bids/${bidId}/accept`, {
        method: "POST",
      }),
    onSuccess: () => {
      notify(`Bid accepted! Awarded to ${freelancerName}`, "success");
      setConfirming(false);
      router.refresh();
    },
    onError: (err) => {
      notify(err instanceof ClientError ? err.message : "Failed to accept bid", "error");
    },
  });

  if (isAccepted) {
    return (
      <span className="tag tag-gold inline-flex items-center gap-1 font-semibold">
        <Trophy size={11} /> Accepted Winning Bid
      </span>
    );
  }

  if (confirming) {
    return (
      <div className="inline-flex items-center gap-1.5 animate-in fade-in">
        <span className="text-[11.5px] text-ink-2">Award lead to {freelancerName}?</span>
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="btn btn-primary h-6 px-2 text-[11px]"
        >
          {mutation.isPending ? "Accepting…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="btn btn-ghost h-6 px-1.5 text-[11px] text-ink-3"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="btn h-6 px-2 text-[11.5px] font-medium text-verdigris hover:border-verdigris hover:bg-verdigris/10 transition-colors"
    >
      <CheckCircle2 size={12} /> Accept Bid
    </button>
  );
}
