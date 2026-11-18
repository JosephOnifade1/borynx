"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { api } from "@/lib/client";
import { routes } from "@/lib/utils";

type Action = "publish" | "request_changes" | "reject";

export function LeadReviewControls({ leadId, revision, canPublish }: { leadId: number; revision: number; canPublish: boolean }) {
  const router = useRouter();
  const id = useId();
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState(false);
  const review = useMutation({
    mutationFn: (action: Action) => api(`/api/mod/leads/${leadId}`, { method: "PATCH", json: { action, revision, reason } }),
    onSuccess: (_, action) => {
      setSaved(true);
      if (action === "publish") router.replace(routes.leadSubmission(leadId));
      router.refresh();
    },
  });
  return (
    <section aria-label="Review decision" className="border-t border-line px-4 py-5 sm:px-6">
      <div className="panel-raised space-y-3 rounded-lg p-4 sm:p-5">
        <div>
          <p className="eyebrow text-ember">Site review · revision {revision}</p>
          <h2 className="display mt-1 text-[17px]">Decide whether to publish</h2>
          <p className="mt-1 text-[13px] text-ink-3">Publishing makes this brief public. A reason is required to request changes or decline it.</p>
        </div>
        {!canPublish && <p className="text-[13px] text-danger">The linked space is not public. Request a correction instead of publishing.</p>}
        <label htmlFor={id} className="eyebrow block">Note to the author</label>
        <textarea id={id} value={reason} maxLength={1000} rows={3} onChange={(e) => setReason(e.target.value)} className="field" placeholder="What should the author change?" />
        {review.isError && <p role="alert" className="text-[13px] text-danger">{review.error.message}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary" disabled={saved || review.isPending || !canPublish} onClick={() => review.mutate("publish")}>Publish lead</button>
          <button type="button" className="btn" disabled={saved || review.isPending || !reason.trim()} onClick={() => review.mutate("request_changes")}>Request changes</button>
          <button type="button" className="btn text-danger" disabled={saved || review.isPending || !reason.trim()} onClick={() => review.mutate("reject")}>Reject</button>
          {review.isPending && <span role="status" className="text-[12px] text-ink-3">Saving decision…</span>}
        </div>
      </div>
    </section>
  );
}

export function WithdrawLeadButton({ leadId }: { leadId: number }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const withdraw = useMutation({
    mutationFn: () => api(`/api/leads/${leadId}/status`, { method: "PATCH", json: { action: "withdraw" } }),
    onSuccess: () => router.refresh(),
  });
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {confirm ? <>
        <p className="w-full text-[13px] text-ink-2">Withdraw this submission? It will stay private and can no longer be reviewed.</p>
        <button type="button" className="btn btn-sm text-danger" disabled={withdraw.isPending || withdraw.isSuccess} onClick={() => withdraw.mutate()}>Confirm withdrawal</button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={withdraw.isPending} onClick={() => setConfirm(false)}>Keep submission</button>
      </> : <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirm(true)}>Withdraw submission</button>}
      {withdraw.isError && <p role="alert" className="w-full text-[13px] text-danger">{withdraw.error.message}</p>}
    </div>
  );
}
