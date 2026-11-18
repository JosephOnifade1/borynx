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

/* ---------------- Login ---------------- */

interface Persona {
  username: string;
  displayName: string;
  headline: string;
  avatarHue: number;
  role: string;
  isVerified: boolean;
  restricted: boolean;
}

export function LoginForm({ personas, destination, existing }: { personas: Persona[]; destination: string; existing: boolean }) {
  const router = useRouter();
  const notify = useNotify();
  const [username, setUsername] = useState("");
  const [sessionUnconfirmed, setSessionUnconfirmed] = useState(false);
  const m = useMutation({
    onMutate: () => setSessionUnconfirmed(false),
    mutationFn: async (username: string): Promise<"cookie" | "header" | "memory" | "blocked"> => {
      clearStoredToken();
      const res = await api<{ ok: true; user: { id: number }; token: string }>("/api/auth/login", { method: "POST", json: { username } });
      // Tier 1 — did the browser keep the session cookie? (no token stored yet → cookie-only probe)
      const viaCookie = await api<{ user: { id: number } | null }>("/api/me", { cache: "no-store" });
      if (viaCookie.user?.id === res.user.id) return "cookie";
      // Tier 2 — cookie dropped (embedded preview). Carry the token in the x-bx-session header.
      const where = storeToken(res.token);
      const viaHeader = await api<{ user: { id: number } | null }>("/api/me", { cache: "no-store" });
      if (viaHeader.user?.id === res.user.id) return where === "memory" ? "memory" : "header";
      clearStoredToken();
      return "blocked";
    },
    onSuccess: (mode) => {
      if (mode === "blocked") {
        setSessionUnconfirmed(true);
        return;
      }
      if (mode === "memory") notify("Signed in for this tab — your browser blocks storage in embedded previews, so a reload signs you out.", "info");
      router.push(destination);
      router.refresh();
    },
    onError: (e) => {
      clearStoredToken();
      notify(e instanceof ClientError ? e.message : "Sign-in failed", "error");
    },
  });
  return (
    <div className="grid gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[1fr_320px]">
      {sessionUnconfirmed && (
        <div role="alert" className="rounded-md border border-danger/50 bg-danger-soft/40 p-4 text-[13px] lg:col-span-2">
          <p className="font-semibold text-danger">Couldn’t confirm the new session</p>
          <p className="mt-1 text-ink-2">Reload and try signing in again. If you’re in an embedded preview, open the app in its own tab first.</p>
          <button type="button" className="btn btn-primary mt-3" onClick={() => window.open(window.location.href, "_blank", "noopener")}>
            Open Borynx in a new tab
          </button>
        </div>
      )}
      <div>
        <p className="eyebrow">{existing ? "Existing local accounts" : "Seeded personas"}</p>
        <p className="mt-1 text-[13px] text-ink-2">{existing
          ? "Pick an account below or enter its handle. This is only for your isolated demo database."
          : "Try the buyer, either bidder, the reviewer, or an unrelated observer."}</p>
        {personas.length === 0 ? <p className="mt-4 text-[13px] text-ink-3">No demo accounts are listed.</p> : (
          <ul className="mt-4 divide-y divide-line rounded-md border border-line">
            {personas.map((p) => (
              <li key={p.username}>
                <button type="button" onClick={() => m.mutate(p.username)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-60" disabled={m.isPending || p.restricted}>
                  <Avatar hue={p.avatarHue} name={p.displayName} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13.5px] font-semibold">
                      {p.displayName}
                      {p.isVerified && <VerifiedMark size={12} />}
                      <span className="num min-w-0 break-all text-[11px] font-normal text-ink-3">{`f/${p.username}`}</span>
                    </span>
                    <span className="block truncate text-[12px] text-ink-3">{p.headline}</span>
                  </span>
                  <span className={cn("tag", p.restricted ? "tag-danger" : p.role === "admin" ? "tag-ember" : p.role === "moderator" ? "tag-gold" : "")}>{p.restricted ? "restricted" : p.role}</span>
                  <LogIn size={14} className="text-ink-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
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
            <input value={username} onChange={(e) => setUsername(e.target.value)} className="field pl-8" placeholder={existing ? "your-handle" : "demo-buyer"}
              maxLength={34} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
          </div>
        </label>
        <button type="submit" className="btn btn-primary mt-4 w-full justify-center" disabled={m.isPending}>
          <LogIn size={14} /> {m.isPending ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-3 text-[11px] text-ink-3">{existing
          ? "Enter the exact handle of an existing test account. No account is created here."
          : "Only the five fictional demo personas can sign in in this mode."}</p>
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
