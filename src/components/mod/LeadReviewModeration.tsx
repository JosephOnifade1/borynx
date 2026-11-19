"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Dialog } from "@/components/shell/Dialog";
import { api } from "@/lib/client";
import { REVIEW_LIMITS, type ReviewAction, type ReviewResult } from "@/lib/lead-review-input";
import { useUiStore } from "@/store/ui";

const copy = {
  publish: { label: "Publish review", hint: "Show this testimonial on the winner’s profile and include the rating in their average." },
  hide: { label: "Hide review", hint: "Remove the testimonial and rating from the profile. This does not remove the lead." },
  restore: { label: "Restore review", hint: "Return this testimonial and rating to public view. The completed lead must still be publicly eligible." },
} as const;

export function LeadReviewModeration({ id, action }: { id: number; action: ReviewAction }) {
  const router = useRouter();
  const notify = useUiStore((s) => s.notify);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const { label, hint } = copy[action];
  const mutation = useMutation({
    mutationFn: () => api<ReviewResult>(`/api/mod/lead-reviews/${id}`, { method: "PATCH", json: { action, reason } }),
    onSuccess: () => {
      setOpen(false);
      notify(action === "hide" ? "Review hidden" : action === "restore" ? "Review restored" : "Review published", "success");
      router.refresh();
    },
  });

  return (
    <>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => { mutation.reset(); setReason(""); setOpen(true); }}>{label}</button>
      <Dialog open={open} onClose={() => { if (!mutation.isPending) setOpen(false); }} title={label} description={hint}>
        <form className="min-h-0 space-y-3 overflow-y-auto p-4 sm:p-5" onSubmit={(event) => {
          event.preventDefault();
          if (reason.trim() && !mutation.isPending) mutation.mutate();
        }}>
          <label htmlFor={reasonId} className="eyebrow block">Reason for the audit log</label>
          <textarea id={reasonId} className="field" rows={3} required maxLength={REVIEW_LIMITS.reason} disabled={mutation.isPending}
            value={reason} onChange={(event) => setReason(event.target.value)} />
          {mutation.error && <p role="alert" className="text-[13px] text-danger">{mutation.error.message}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-ghost" disabled={mutation.isPending} onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className={`btn ${action === "hide" ? "btn-danger" : "btn-primary"}`} disabled={!reason.trim() || mutation.isPending}>
              {mutation.isPending ? "Saving…" : label}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
