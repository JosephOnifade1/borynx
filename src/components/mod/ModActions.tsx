"use client";

import { useMutation } from "@tanstack/react-query";
import { Ban, Check, Clock, ShieldCheck, ShieldOff, Trash2, TriangleAlert, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientError } from "@/lib/client";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

export function ReportDecision({ reportId }: { reportId: number }) {
  const router = useRouter();
  const notify = useUiStore((s) => s.notify);
  const m = useMutation({
    mutationFn: (action: "approve" | "dismiss") => api<{ ok: true; status: string }>(`/api/mod/reports/${reportId}`, { method: "PATCH", json: { action } }),
    onSuccess: (r) => {
      notify(r.status === "approved" ? "Content removed and report resolved" : "Report dismissed", "success");
      router.refresh();
    },
    onError: (e) => notify(e instanceof ClientError ? e.message : "Action failed", "error"),
  });
  return (
    <div className="flex gap-1.5">
      <button type="button" className="btn btn-sm btn-danger" onClick={() => m.mutate("approve")} disabled={m.isPending} title="Approve report: remove the content">
        <Trash2 size={12} /> Remove
      </button>
      <button type="button" className="btn btn-sm" onClick={() => m.mutate("dismiss")} disabled={m.isPending} title="Dismiss report: keep the content">
        <X size={12} /> Dismiss
      </button>
    </div>
  );
}

export function UserDiscipline({ userId, isBanned, isVerified, compact }: { userId: number; isBanned: boolean; isVerified: boolean; compact?: boolean }) {
  const router = useRouter();
  const notify = useUiStore((s) => s.notify);
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: (payload: { action: string; days?: number }) => api<{ ok: true }>(`/api/mod/users/${userId}`, { method: "PATCH", json: { ...payload, reason } }),
    onSuccess: (_r, v) => {
      notify(`User ${v.action}${v.action.endsWith("n") ? "ed" : v.action === "verify" ? " verified" : "ed"}`.replace("verifyed", "verified"), "success");
      setReason("");
      router.refresh();
    },
    onError: (e) => notify(e instanceof ClientError ? e.message : "Action failed", "error"),
  });
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", compact && "gap-1")}>
      {!compact && <input value={reason} onChange={(e) => setReason(e.target.value)} className="field h-7 w-44 text-[12px]" placeholder="Reason (audit log)" />}
      {isBanned ? (
        <button type="button" className="btn btn-sm" onClick={() => m.mutate({ action: "unban" })} disabled={m.isPending}>
          <Check size={12} /> Lift ban
        </button>
      ) : (
        <>
          <button type="button" className="btn btn-sm" onClick={() => m.mutate({ action: "warn" })} disabled={m.isPending} title="Issue a warning">
            <TriangleAlert size={12} /> Warn
          </button>
          <button type="button" className="btn btn-sm" onClick={() => m.mutate({ action: "suspend", days: 7 })} disabled={m.isPending} title="7-day suspension">
            <Clock size={12} /> Suspend 7d
          </button>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => m.mutate({ action: "ban" })} disabled={m.isPending} title="Permanent ban">
            <Ban size={12} /> Ban
          </button>
        </>
      )}
      {!isVerified && (
        <button type="button" className="btn btn-sm" onClick={() => m.mutate({ action: "verify" })} disabled={m.isPending} title="Manually vet as Verified Pro">
          <ShieldCheck size={12} /> Verify
        </button>
      )}
    </div>
  );
}

export function ModeratorManager({ slug, moderators }: { slug: string; moderators: Array<{ username: string; modRole: string | null }> }) {
  const router = useRouter();
  const notify = useUiStore((s) => s.notify);
  const [username, setUsername] = useState("");
  const m = useMutation({
    mutationFn: (p: { username: string; remove?: boolean }) => api<{ ok: true; modRole: string | null }>(`/api/spaces/${slug}/moderators`, { method: "POST", json: p }),
    onSuccess: (_r, v) => {
      notify(v.remove ? `Removed f/${v.username} from the mod team` : `f/${v.username} is now a moderator`, "success");
      setUsername("");
      router.refresh();
    },
    onError: (e) => notify(e instanceof ClientError ? e.message : "Action failed", "error"),
  });
  return (
    <div>
      <ul className="divide-y divide-line rounded-md border border-line">
        {moderators.map((mod) => (
          <li key={mod.username} className="flex items-center justify-between px-3 py-2 text-[13px]">
            <span className="num">
              f/{mod.username} <span className={cn("tag ml-1", mod.modRole === "owner" ? "tag-gold" : "")}>{mod.modRole}</span>
            </span>
            {mod.modRole !== "owner" && (
              <button type="button" className="btn btn-ghost btn-sm text-ink-3" onClick={() => m.mutate({ username: mod.username, remove: true })} disabled={m.isPending}>
                <ShieldOff size={12} /> Demote
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (username.trim()) m.mutate({ username: username.trim().replace(/^[fu]\//, "") });
        }}
      >
        <input value={username} onChange={(e) => setUsername(e.target.value)} className="field h-8" placeholder="f/handle to promote" />
        <button type="submit" className="btn btn-sm h-8" disabled={m.isPending}>
          <UserPlus size={12} /> Add mod
        </button>
      </form>
    </div>
  );
}
