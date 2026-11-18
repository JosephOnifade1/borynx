"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { Lead } from "@/db/schema";
import { api, ClientError } from "@/lib/client";
import { HttpError } from "@/lib/errors";
import { MAX_BID_AMOUNT, parseBidInput } from "@/lib/lead-engagement";

export function BidForm({ leadId, currency, budgetUnit }: { leadId: number; currency: string; budgetUnit: Lead["budgetUnit"] }) {
  const prefix = useId();
  const router = useRouter();
  const query = useQueryClient();
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState("");
  const [issue, setIssue] = useState<{ message: string; fields?: Record<string, string> } | null>(null);
  const bid = useMutation({
    mutationFn: (input: ReturnType<typeof parseBidInput>) => api<{ id: number }>(`/api/leads/${leadId}/bids`, { method: "POST", json: input }),
    onSuccess: () => {
      void query.invalidateQueries({ queryKey: ["leads"] });
      router.refresh();
    },
    onError: (error) => setIssue({ message: error.message, fields: error instanceof ClientError ? error.fields : undefined }),
  });
  const unit = budgetUnit === "hourly" ? " per hour" : budgetUnit === "fixed" ? " fixed" : "";
  const locked = bid.isPending || bid.isSuccess;
  return (
    <form noValidate aria-label="Send a private pitch" onSubmit={(event) => {
      event.preventDefault();
      if (locked) return;
      setIssue(null);
      try {
        bid.mutate(parseBidInput({ message, amount: amount.trim() ? Number(amount) : undefined }));
      } catch (error) {
        setIssue({ message: error instanceof Error ? error.message : "Check your pitch.", fields: error instanceof HttpError ? error.fields : undefined });
      }
    }}>
      <fieldset className="min-w-0 space-y-3" disabled={locked}>
        <legend className="sr-only">Pitch details</legend>
        {issue && <p role="alert" className="rounded-md border border-danger/40 px-3 py-2 text-[13px] text-danger">{issue.message}</p>}
        <label className="block">
          <span className="eyebrow">Your pitch</span>
          <textarea aria-invalid={Boolean(issue?.fields?.message) || undefined} value={message} onChange={(event) => { setMessage(event.target.value); setIssue(null); }}
            rows={5} className="field mt-1.5" placeholder="Describe your approach, relevant work, and timeline." minLength={20} maxLength={4000} required />
        </label>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block">
            <span className="eyebrow">Quote ({currency}{unit})</span>
            <input type="number" min={1} max={MAX_BID_AMOUNT} step={1} required aria-describedby={`${prefix}-quote-hint`}
              aria-invalid={Boolean(issue?.fields?.amount) || undefined} value={amount} onChange={(event) => { setAmount(event.target.value); setIssue(null); }} className="field num mt-1.5 w-44" />
          </label>
          <button type="submit" className="btn btn-primary">{bid.isPending ? "Sending…" : bid.isSuccess ? "Pitch sent" : "Send pitch"}</button>
        </div>
        <p id={`${prefix}-quote-hint`} className="text-[12.5px] text-ink-3">
          {budgetUnit === null ? "This older listing has no budget unit. Enter a whole amount and state the basis of your quote in the pitch." : "Enter a whole amount in the listing’s currency and budget unit."}
        </p>
        <p className="text-[12.5px] text-ink-3">Only you and the poster can read your pitch and quote.</p>
      </fieldset>
    </form>
  );
}
