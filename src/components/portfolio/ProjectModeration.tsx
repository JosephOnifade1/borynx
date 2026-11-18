"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Dialog } from "@/components/shell/Dialog";
import { api } from "@/lib/client";
import { PROJECT_LIMITS } from "@/lib/portfolio-input";
import { useUiStore } from "@/store/ui";

export function ProjectModeration({ id, action }: { id: number; action: "hide" | "restore" }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const router = useRouter();
  const notify = useUiStore((s) => s.notify);
  const name = action === "hide" ? "Hide project" : "Restore project";
  const mutation = useMutation({
    mutationFn: () => api(`/api/mod/projects/${id}`, { method: "PATCH", json: { action, reason } }),
    onSuccess: () => {
      setOpen(false);
      notify(action === "hide" ? "Project and cover hidden" : "Moderation hold removed", "success");
      router.refresh();
    },
  });
  return (
    <>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => { mutation.reset(); setReason(""); setOpen(true); }}>{name}</button>
      <Dialog open={open} onClose={() => { if (!mutation.isPending) setOpen(false); }} title={name}
        description={action === "hide" ? "Remove this project and cover from public view. The owner keeps their private copy." : "Remove the hold. The project will be public only if the owner has it published."}>
        <form className="space-y-3 p-5" onSubmit={(event) => { event.preventDefault(); if (reason.trim() && !mutation.isPending) mutation.mutate(); }}>
          <label htmlFor={reasonId} className="eyebrow block">Reason for the audit log</label>
          <textarea id={reasonId} className="field" rows={3} required maxLength={PROJECT_LIMITS.reason} value={reason} onChange={(event) => setReason(event.target.value)} />
          {mutation.error && <p role="alert" className="text-[13px] text-danger">{mutation.error.message}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" disabled={mutation.isPending} onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className={`btn ${action === "hide" ? "btn-danger" : "btn-primary"}`} disabled={!reason.trim() || mutation.isPending}>{mutation.isPending ? "Saving…" : name}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
