"use client";

import { useMutation } from "@tanstack/react-query";
import { GitBranch, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { readStoredReferral, useSession } from "@/components/providers";
import { clearStoredToken, storeToken } from "@/lib/browser";
import { Avatar, VerifiedMark } from "@/components/primitives";
import { api, ClientError } from "@/lib/client";
import { LEAD_CATEGORIES, LEAD_KIND_LABEL } from "@/lib/constants";
import { cn, routes } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

const useNotify = () => useUiStore((s) => s.notify);

/* ---------------- Lead composer ---------------- */

export function LeadComposer({ spaces }: { spaces: Array<{ slug: string; name: string }> }) {
  const router = useRouter();
  const notify = useNotify();
  const user = useSession();
  const [form, setForm] = useState({ title: "", description: "", category: "Software", kind: "contract", budgetMin: "", budgetMax: "", currency: "USD", location: "Remote", spaceSlug: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const m = useMutation({
    mutationFn: () => api<{ href: string; newBadges: string[]; flagged: boolean }>("/api/leads", { method: "POST", json: { ...form, budgetMin: Number(form.budgetMin), budgetMax: Number(form.budgetMax) } }),
    onSuccess: (r) => {
      notify(r.flagged ? "Lead posted — queued for review" : "Lead posted", "success");
      r.newBadges.forEach((b) => notify(`Badge unlocked: ${b}`, "success"));
      router.push(r.href);
      router.refresh();
    },
    onError: (e) => notify(e instanceof ClientError ? e.message : "Failed to post lead", "error"),
  });
  return (
    <form
      className="space-y-5 px-5 py-6 sm:px-8"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block sm:col-span-1">
          <span className="eyebrow">Type</span>
          <select value={form.kind} onChange={set("kind")} className="field mt-1.5">
            {Object.entries(LEAD_KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="eyebrow">Category</span>
          <select value={form.category} onChange={set("category")} className="field mt-1.5">
            {LEAD_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="eyebrow">Space (optional)</span>
          <select value={form.spaceSlug} onChange={set("spaceSlug")} className="field mt-1.5">
            <option value="">— none —</option>
            {spaces.map((s) => (
              <option key={s.slug} value={s.slug}>
                b/{s.slug}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="eyebrow">Title</span>
        <input value={form.title} onChange={set("title")} className="field mt-1.5 text-[15px] font-medium" placeholder="What needs doing, for whom, by when" minLength={10} maxLength={180} required />
      </label>
      <label className="block">
        <span className="eyebrow">Brief · markdown</span>
        <textarea value={form.description} onChange={set("description")} rows={10} className="field mt-1.5 font-mono text-[13px]" placeholder="Scope, deliverables, constraints, how you'll evaluate bids. Minimum 40 characters." minLength={40} required />
      </label>
      <div className="grid gap-4 sm:grid-cols-4">
        <label className="block">
          <span className="eyebrow">Budget min</span>
          <input type="number" min={0} value={form.budgetMin} onChange={set("budgetMin")} className="field num mt-1.5" placeholder="0" />
        </label>
        <label className="block">
          <span className="eyebrow">Budget max</span>
          <input type="number" min={0} value={form.budgetMax} onChange={set("budgetMax")} className="field num mt-1.5" placeholder="0" />
        </label>
        <label className="block">
          <span className="eyebrow">Currency</span>
          <select value={form.currency} onChange={set("currency")} className="field mt-1.5">
            <option>USD</option>
            <option>EUR</option>
            <option>GBP</option>
          </select>
        </label>
        <label className="block">
          <span className="eyebrow">Location</span>
          <input value={form.location} onChange={set("location")} className="field mt-1.5" maxLength={80} />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
          <ShieldCheck size={13} className={user?.isVerified ? "text-verdigris" : "text-ink-4"} />
          {user?.isVerified ? "You're a Verified Pro — this lead publishes with the verified mark." : "Unverified leads publish without the verified mark until a moderator vets them."}
        </p>
        <div className="flex gap-2">
          <Link href={routes.leads()} className="btn">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={m.isPending}>
            {m.isPending ? "Posting…" : "Post lead"}
          </button>
        </div>
      </div>
    </form>
  );
}

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

export function LoginForm({ personas, next }: { personas: Persona[]; next?: string }) {
  const router = useRouter();
  const notify = useNotify();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [cookieBlocked, setCookieBlocked] = useState(false);
  const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const m = useMutation({
    mutationFn: async (u: { username: string; create: boolean; displayName?: string }): Promise<"cookie" | "header" | "memory" | "blocked"> => {
      clearStoredToken();
      const res = await api<{ ok: true; token: string }>("/api/auth/login", { method: "POST", json: { ...u, referral: readStoredReferral() } });
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
        <p className="mt-1 text-[13px] text-ink-2">Pick an identity to explore different permission tiers — admin, moderator, verified pro, newcomer, or a banned account.</p>
        <ul className="mt-4 divide-y divide-line rounded-md border border-line">
          {personas.map((p) => (
            <li key={p.username}>
              <button type="button" onClick={() => m.mutate({ username: p.username, create: false })} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-sunken" disabled={m.isPending}>
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
          m.mutate({ username, create: mode === "create", displayName });
        }}
      >
        <div role="tablist" className="mb-4 inline-flex rounded-md border border-line p-0.5">
          {(["signin", "create"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={mode === t} onClick={() => setMode(t)} className={cn("h-7 rounded px-3 text-[12.5px] font-medium", mode === t ? "bg-sunken text-ink" : "text-ink-3")}>
              {t === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="eyebrow">Handle</span>
          <div className="relative mt-1.5">
            <span className="num pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">f/</span>
            <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} className="field pl-8" placeholder="your-handle" pattern="[a-z0-9][a-z0-9_.\-]{1,31}" required />
          </div>
        </label>
        {mode === "create" && (
          <label className="mt-3 block">
            <span className="eyebrow">Display name</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="field mt-1.5" placeholder="How you appear on the ledger" maxLength={80} />
          </label>
        )}
        <button type="submit" className="btn btn-primary mt-4 w-full justify-center" disabled={m.isPending}>
          {mode === "create" ? <UserPlus size={14} /> : <LogIn size={14} />}
          {m.isPending ? "Working…" : mode === "create" ? "Create & sign in" : "Sign in"}
        </button>
        <p className="mt-3 text-[11px] text-ink-3">Sandbox auth: a session cookie keyed to your user row. Referral attribution captured on landing is converted on account creation.</p>
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
