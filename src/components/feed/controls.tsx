"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowBigDown, ArrowBigUp, Bookmark, Link2 } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { useSession } from "@/components/providers";
import { api, ClientError } from "@/lib/client";
import { RANK_MODES, type RankMode } from "@/lib/sorting";
import { buildShareUrl, cn, formatCompact } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

/* ---------------- Sort selector ---------------- */

export const SortSelector = memo(function SortSelector({ value, onChange, modes = RANK_MODES }: { value: RankMode; onChange: (m: RankMode) => void; modes?: typeof RANK_MODES }) {
  return (
    <div role="radiogroup" aria-label="Ranking mode" className="flex items-center gap-1">
      {modes.map((m) => (
        <button
          key={m.id}
          role="radio"
          aria-checked={value === m.id}
          type="button"
          onClick={() => onChange(m.id)}
          title={m.hint}
          className={cn("relative h-9 px-3 text-[13px] font-semibold transition-colors", value === m.id ? "text-ink" : "text-ink-3 hover:text-ink")}
        >
          {m.label}
          {value === m.id && <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-ember" />}
        </button>
      ))}
    </div>
  );
});

/* ---------------- Vote rail (optimistic) ---------------- */

interface VoteRailProps {
  targetType: "post" | "comment" | "lead";
  id: number;
  upvotes: number;
  downvotes: number;
  userVote: number;
  orientation?: "vertical" | "horizontal";
  size?: "sm" | "md";
}

interface VoteResponse {
  upvotes: number;
  downvotes: number;
  userVote: number;
}

export const VoteRail = memo(function VoteRail({ targetType, id, upvotes, downvotes, userVote, orientation = "vertical", size = "md" }: VoteRailProps) {
  const user = useSession();
  const notify = useUiStore((s) => s.notify);
  const [state, setState] = useState<VoteResponse>({ upvotes, downvotes, userVote });
  useEffect(() => setState({ upvotes, downvotes, userVote }), [upvotes, downvotes, userVote]);

  const mutation = useMutation({
    mutationFn: (value: number) => api<VoteResponse>(`/api/${targetType}s/${id}/vote`, { method: "POST", json: { value } }),
    onMutate: (value) => {
      const prev = state;
      const next: VoteResponse = {
        upvotes: prev.upvotes + (value === 1 ? 1 : 0) - (prev.userVote === 1 ? 1 : 0),
        downvotes: prev.downvotes + (value === -1 ? 1 : 0) - (prev.userVote === -1 ? 1 : 0),
        userVote: value,
      };
      setState(next);
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx) setState(ctx.prev);
      notify(err instanceof ClientError ? err.message : "Vote failed", "error");
    },
    onSuccess: (data) => setState(data),
  });

  const cast = (value: 1 | -1) => {
    if (!user) return notify("Sign in to vote", "info");
    if (user.isBanned) return notify("Your account is restricted from voting", "error");
    mutation.mutate(state.userVote === value ? 0 : value);
  };

  const score = state.upvotes - state.downvotes;
  const iconSize = size === "sm" ? 15 : 18;
  return (
    <div className={cn("flex items-center", orientation === "vertical" ? "w-10 flex-col gap-0" : "flex-row gap-0.5")} aria-label={`Score ${score}`}>
      <button type="button" onClick={() => cast(1)} aria-pressed={state.userVote === 1} aria-label="Upvote" className={cn("rounded p-0.5 transition-colors hover:bg-sunken", state.userVote === 1 ? "text-ember" : "text-ink-3 hover:text-ink")}>
        <ArrowBigUp size={iconSize} strokeWidth={1.8} fill={state.userVote === 1 ? "currentColor" : "none"} />
      </button>
      <span className={cn("num font-semibold tabular-nums", size === "sm" ? "text-[12px]" : "text-[13px]", score < 0 ? "text-danger" : state.userVote === 1 ? "text-ember" : "text-ink")}>{formatCompact(score)}</span>
      <button type="button" onClick={() => cast(-1)} aria-pressed={state.userVote === -1} aria-label="Downvote" className={cn("rounded p-0.5 transition-colors hover:bg-sunken", state.userVote === -1 ? "text-verdigris" : "text-ink-3 hover:text-ink")}>
        <ArrowBigDown size={iconSize} strokeWidth={1.8} fill={state.userVote === -1 ? "currentColor" : "none"} />
      </button>
    </div>
  );
});

/* ---------------- Save (optimistic) ---------------- */

export const SaveButton = memo(function SaveButton({ postId, saved: initial }: { postId: number; saved: boolean }) {
  const user = useSession();
  const notify = useUiStore((s) => s.notify);
  const [saved, setSaved] = useState(initial);
  useEffect(() => setSaved(initial), [initial]);
  const mutation = useMutation({
    mutationFn: () => api<{ saved: boolean }>(`/api/posts/${postId}/save`, { method: "POST" }),
    onMutate: () => {
      const prev = saved;
      setSaved(!prev);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) setSaved(ctx.prev);
      notify("Could not update save", "error");
    },
    onSuccess: (d) => setSaved(d.saved),
  });
  return (
    <button type="button" onClick={() => (user ? mutation.mutate() : notify("Sign in to save threads", "info"))} aria-pressed={saved} className={cn("btn btn-ghost btn-sm", saved ? "text-gold" : "text-ink-3")}>
      <Bookmark size={12} fill={saved ? "currentColor" : "none"} /> {saved ? "Saved" : "Save"}
    </button>
  );
});

/* ---------------- Share with attribution ---------------- */

export const ShareButton = memo(function ShareButton({ path, label = "Share", className }: { path: string; label?: string; className?: string }) {
  const user = useSession();
  const notify = useUiStore((s) => s.notify);
  const copy = async () => {
    const url = buildShareUrl(path, user?.id ?? null, window.location.origin);
    try {
      await navigator.clipboard.writeText(url);
      notify("Attributed link copied", "success");
    } catch {
      try {
        window.prompt("Copy this link", url);
      } catch {
        notify(url, "info");
      }
    }
  };
  return (
    <button type="button" onClick={copy} className={cn("btn btn-ghost btn-sm text-ink-3", className)} aria-label="Copy share link">
      <Link2 size={12} /> {label}
    </button>
  );
});
