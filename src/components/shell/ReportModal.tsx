"use client";

import { useMutation } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { useCallback, useState } from "react";
import { useSession } from "@/components/providers";
import { api, ClientError } from "@/lib/client";
import { REPORT_REASONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useUiStore, type ReportTargetRef } from "@/store/ui";
import { Dialog } from "./Dialog";

export function ReportModal() {
  const target = useUiStore((s) => s.reportTarget);
  const close = useUiStore((s) => s.closeReport);
  const notify = useUiStore((s) => s.notify);
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]["id"]>("spam_scam");
  const [details, setDetails] = useState("");

  const mutation = useMutation({
    mutationFn: (t: ReportTargetRef) => api<{ id: number }>("/api/reports", { method: "POST", json: { targetType: t.type, targetId: t.id, reason, details } }),
    onSuccess: () => {
      notify("Report filed. A moderator will review it.", "success");
      setDetails("");
      close();
    },
    onError: (err) => notify(err instanceof ClientError ? err.message : "Could not file report", "error"),
  });

  const onClose = useCallback(() => {
    if (!mutation.isPending) close();
  }, [close, mutation.isPending]);

  return (
    <Dialog open={Boolean(target)} onClose={onClose} title="Report content" description={target ? `Flagging ${target.type === "lead_review" ? "review" : target.type} · “${target.label.slice(0, 70)}${target.label.length > 70 ? "…" : ""}”` : undefined}>
      <form
        className="min-h-0 overflow-y-auto px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (target) mutation.mutate(target);
        }}
      >
        <fieldset>
          <legend className="eyebrow mb-2">Reason</legend>
          <div className="space-y-1">
            {REPORT_REASONS.map((r) => (
              <label key={r.id} className={cn("flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition-colors", reason === r.id ? "border-ember bg-ember-soft/40" : "border-line hover:border-line-strong")}>
                <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} className="mt-1 accent-[var(--ember)]" />
                <span>
                  <span className="block text-[13px] font-semibold">{r.label}</span>
                  <span className="block text-[12px] text-ink-3">{r.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-4 block">
          <span className="eyebrow">Context (optional)</span>
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1000} className="field mt-1.5" placeholder="What should the moderator look at?" />
        </label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11.5px] text-ink-3">Reports are anonymous to the author. Abuse of reporting is itself moderated.</p>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              <Flag size={13} /> {mutation.isPending ? "Filing…" : "File report"}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

/** Small trigger used across posts, comments, leads, and reviews. */
export function ReportButton({ target, className }: { target: ReportTargetRef; className?: string }) {
  const user = useSession();
  const openReport = useUiStore((s) => s.openReport);
  const notify = useUiStore((s) => s.notify);
  return (
    <button
      type="button"
      className={cn("btn btn-ghost btn-sm text-ink-3", className)}
      onClick={() => (user ? openReport(target) : notify("Sign in to report content", "info"))}
      aria-label={`Report this ${target.type === "lead_review" ? "review" : target.type}`}
    >
      <Flag size={12} /> Report
    </button>
  );
}
