"use client";

import { useMutation } from "@tanstack/react-query";
import { GitBranch, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/components/providers";
import { clearStoredToken, storeToken } from "@/lib/browser";
import { Avatar, VerifiedMark } from "@/components/primitives";
import { api, ClientError } from "@/lib/client";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

const useNotify = () => useUiStore((s) => s.notify);

/* ---------------- Join ---------------- */

export function JoinButton({ slug, joined: initial, privacy, isOwner }: { slug: string; joined: boolean; privacy: string; isOwner: boolean }) {
  const user = useSession();
  const notify = useNotify();
  const router = useRouter();
  const [joined, setJoined] = useState(initial);
  const m = useMutation({
    mutationFn: () => api<{ joined: boolean }>(`/api/spaces/${slug}/join`, { method: "POST" }),
    onMutate: () => {
      const prev = joined;
      setJoined(!prev);
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx) setJoined(ctx.prev);
      notify(e instanceof ClientError ? e.message : "Failed", "error");
    },
    onSuccess: (r) => {
      setJoined(r.joined);
      router.refresh();
    },
  });
  if (isOwner) return <span className="tag tag-gold">owner</span>;
  return (
    <button type="button" className={cn("btn", joined ? "" : "btn-primary")} onClick={() => (user ? m.mutate() : notify("Sign in to join spaces", "info"))} aria-pressed={joined}>
      {joined ? "Joined" : privacy === "private" ? "Request invite" : "Join space"}
    </button>
  );
}

/* ---------------- Bid ---------------- */

export function BidForm({ leadId, disabledReason }: { leadId: number; disabledReason: string | null }) {
  const notify = useNotify();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState("");
  const m = useMutation({
    mutationFn: () => api<{ id: number }>(`/api/leads/${leadId}/bids`, { method: "POST", json: { message, amount: Number(amount) } }),
    onSuccess: () => {
      notify("Bid submitted", "success");
      setMessage("");
      router.refresh();
    },
    onError: (e) => notify(e instanceof ClientError ? e.message : "Bid failed", "error"),
  });
  if (disabledReason) return <p className="rounded-md border border-dashed border-line-strong px-4 py-3 text-[13px] text-ink-2">{disabledReason}</p>;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} className="field" placeholder="Your pitch: relevant work, approach, timeline. Minimum 20 characters." minLength={20} required />
      <div className="flex items-center gap-3">
        <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="field num w-40" placeholder="Your quote" />
        <button type="submit" className="btn btn-primary ml-auto" disabled={m.isPending}>
          {m.isPending ? "Submitting…" : "Submit bid"}
        </button>
      </div>
    </form>
  );
}

/* ---------------- Login ---------------- */

interface Persona {
  username: string;
  displayName: string;
  headline: string;
  avatarHue: number;
  role: string;
  isVerified: boolean;
  isBanned: boolean;
}

export function LoginForm({ personas, destination }: { personas: Persona[]; destination: string }) {
  const router = useRouter();
  const notify = useNotify();
  const [username, setUsername] = useState("");
  const [cookieBlocked, setCookieBlocked] = useState(false);
  const m = useMutation({
    mutationFn: async (username: string): Promise<"cookie" | "header" | "memory" | "blocked"> => {
      clearStoredToken();
      const res = await api<{ ok: true; token: string }>("/api/auth/login", { method: "POST", json: { username } });
      // Tier 1 — did the browser keep the session cookie? (no token stored yet → cookie-only probe)
      const viaCookie = await api<{ user: { id: number } | null }>("/api/me", { cache: "no-store" });
      if (viaCookie.user) return "cookie";
      // Tier 2 — cookie dropped (embedded preview). Carry the token in the x-bx-session header.
      const where = storeToken(res.token);
      const viaHeader = await api<{ user: { id: number } | null }>("/api/me", { cache: "no-store" });
      if (viaHeader.user) return where === "memory" ? "memory" : "header";
      clearStoredToken();
      return "blocked";
    },
    onSuccess: (mode) => {
      if (mode === "blocked") {
        setCookieBlocked(true);
        notify("Your browser blocked the session in this embedded view — open Borynx in a new tab.", "error");
        return;
      }
      if (mode === "memory") notify("Signed in for this tab — your browser blocks storage in embedded previews, so a reload signs you out.", "info");
      router.push(destination);
      router.refresh();
    },
    onError: (e) => notify(e instanceof ClientError ? e.message : "Sign-in failed", "error"),
  });
  return (
    <div className="grid gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[1fr_320px]">
      {cookieBlocked && (
        <div role="alert" className="rounded-md border border-danger/50 bg-danger-soft/40 p-4 text-[13px] lg:col-span-2">
          <p className="font-semibold text-danger">Session cookie blocked</p>
          <p className="mt-1 text-ink-2">This page is running inside an embedded preview frame and your browser refused to store the login cookie there. Open the app in its own tab and sign in again — everything else works identically.</p>
          <button type="button" className="btn btn-primary mt-3" onClick={() => window.open(window.location.href, "_blank", "noopener")}>
            Open Borynx in a new tab
          </button>
        </div>
      )}
      <div>
        <p className="eyebrow">Seeded personas</p>
        <p className="mt-1 text-[13px] text-ink-2">Try the buyer, either bidder, the reviewer, or an unrelated observer.</p>
        <ul className="mt-4 divide-y divide-line rounded-md border border-line">
          {personas.map((p) => (
            <li key={p.username}>
              <button type="button" onClick={() => m.mutate(p.username)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-sunken" disabled={m.isPending}>
                <Avatar hue={p.avatarHue} name={p.displayName} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                    {p.displayName}
                    {p.isVerified && <VerifiedMark size={12} />}
                    <span className="num text-[11px] font-normal text-ink-3">f/{p.username}</span>
                  </span>
                  <span className="block truncate text-[12px] text-ink-3">{p.headline}</span>
                </span>
                <span className={cn("tag", p.isBanned ? "tag-danger" : p.role === "admin" ? "tag-ember" : p.role === "moderator" ? "tag-gold" : "")}>{p.isBanned ? "banned" : p.role}</span>
                <LogIn size={14} className="text-ink-3" />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <form
        className="panel-raised h-fit rounded-lg p-5"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate(username);
        }}
      >
        <label className="block">
          <span className="eyebrow">Handle</span>
          <div className="relative mt-1.5">
            <span className="num pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">f/</span>
            <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} className="field pl-8" placeholder="demo-buyer" pattern="[a-z0-9][a-z0-9_.\-]{1,31}" required />
          </div>
        </label>
        <button type="submit" className="btn btn-primary mt-4 w-full justify-center" disabled={m.isPending}>
          <LogIn size={14} /> {m.isPending ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-3 text-[11px] text-ink-3">Only the fictional accounts listed here can sign in in demo mode.</p>
      </form>
    </div>
  );
}

/* ---------------- Verification ---------------- */

export function VerifyForm({ githubUrl, portfolioUrl }: { githubUrl: string | null; portfolioUrl: string | null }) {
  const notify = useNotify();
  const router = useRouter();
  const [gh, setGh] = useState(githubUrl ?? "");
  const [pf, setPf] = useState(portfolioUrl ?? "");
  const m = useMutation({
    mutationFn: () => api<{ ok: true; newBadges: string[] }>("/api/me/verify", { method: "POST", json: { githubUrl: gh, portfolioUrl: pf } }),
    onSuccess: (r) => {
      notify("Verified Pro status granted", "success");
      r.newBadges.forEach((b) => notify(`Badge unlocked: ${b}`, "success"));
      router.refresh();
    },
    onError: (e) => notify(e instanceof ClientError ? e.message : "Verification failed", "error"),
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <label className="block">
        <span className="eyebrow">GitHub profile</span>
        <input value={gh} onChange={(e) => setGh(e.target.value)} className="field mt-1.5" placeholder="https://github.com/handle" required />
      </label>
      <label className="block">
        <span className="eyebrow">Portfolio (optional)</span>
        <input value={pf} onChange={(e) => setPf(e.target.value)} className="field mt-1.5" placeholder="https://" />
      </label>
      <button type="submit" className="btn btn-primary w-full justify-center" disabled={m.isPending}>
        <GitBranch size={14} /> {m.isPending ? "Verifying…" : "Verify via GitHub"}
      </button>
    </form>
  );
}
