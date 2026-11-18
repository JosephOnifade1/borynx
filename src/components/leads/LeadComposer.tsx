"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useSyncExternalStore } from "react";
import type { Lead } from "@/db/schema";
import { useSession } from "@/components/providers";
import { safeStorage } from "@/lib/browser";
import { api, ClientError, queryKeys } from "@/lib/client";
import { LEAD_CATEGORIES, LEAD_KIND_LABEL } from "@/lib/constants";
import { HttpError } from "@/lib/errors";
import { CONTRACT_FLOORS, LEAD_BUDGET_UNITS, LEAD_CURRENCIES, LEAD_KINDS, LEAD_SKILLS, MAX_LEAD_BUDGET, MAX_LEAD_SKILLS, parseLeadFields, parseSubmissionKey, type LeadFields, type LeadInput } from "@/lib/lead-input";
import { routes } from "@/lib/utils";

type DraftFields = Omit<LeadFields, "kind" | "category" | "currency" | "budgetUnit" | "budgetMin" | "budgetMax" | "deadlineAt" | "spaceSlug"> & {
  kind: string; category: string; currency: string; budgetUnit: string; budgetMin: string; budgetMax: string; deadlineAt: string; spaceSlug: string;
};
type Draft = { fields: DraftFields; key: string };
export type LeadRevision = { id: number; revision: number; enforceFloor: boolean; fields: DraftFields };
const DRAFT_KEY = "bx-lead-draft-v1";
const EMPTY: DraftFields = {
  title: "", description: "", category: LEAD_CATEGORIES[0], kind: "contract", budgetMin: "", budgetMax: "", currency: "USD",
  budgetUnit: "fixed", skillTags: [], deadlineAt: "", location: "Remote", spaceSlug: "",
};
const subscribe = () => () => undefined;
const readDraft = () => safeStorage.get(DRAFT_KEY, "session");
const serverDraft = () => null;

function decodeDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Partial<Draft>;
    if (!stored.fields) return null;
    const fields = { ...EMPTY };
    for (const key of Object.keys(EMPTY) as (keyof DraftFields)[]) {
      const value = stored.fields[key];
      if (key === "skillTags") {
        if (Array.isArray(value)) fields.skillTags = value.filter((s) => typeof s === "string" && Object.hasOwn(LEAD_SKILLS, s)).slice(0, MAX_LEAD_SKILLS);
      } else if (typeof value === "string") fields[key] = value;
    }
    return { fields, key: parseSubmissionKey(stored.key) };
  } catch {
    return null;
  }
}

export function LeadComposer({ spaces, demoMode = false, correction }: {
  spaces: Array<{ slug: string; name: string }>;
  demoMode?: boolean;
  correction?: LeadRevision;
}) {
  const router = useRouter();
  const query = useQueryClient();
  const user = useSession();
  const prefix = useId();
  const persisted = useSyncExternalStore(subscribe, readDraft, serverDraft);
  const restored = correction ? null : decodeDraft(persisted);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [issue, setIssue] = useState<{ message: string; fields?: Record<string, string> } | null>(null);
  const [saved, setSaved] = useState(false);
  const fields = draft?.fields ?? correction?.fields ?? restored?.fields ?? EMPTY;
  const key = draft?.key ?? restored?.key;
  const applyFloor = correction?.enforceFloor ?? true;
  const floor = applyFloor && fields.kind === "contract" && Object.hasOwn(CONTRACT_FLOORS, fields.currency) && LEAD_BUDGET_UNITS.some((unit) => unit === fields.budgetUnit)
    ? CONTRACT_FLOORS[fields.currency as keyof typeof CONTRACT_FLOORS][fields.budgetUnit as (typeof LEAD_BUDGET_UNITS)[number]] : 0;

  const saveDraft = (values: DraftFields, newKey = key ?? crypto.randomUUID()) => {
    const next = { fields: values, key: newKey };
    setDraft(next);
    if (!correction) safeStorage.set(DRAFT_KEY, JSON.stringify(next), "session");
    return newKey;
  };
  const set = <K extends keyof DraftFields>(name: K, value: DraftFields[K]) => {
    setIssue(null);
    saveDraft({ ...fields, [name]: value });
  };

  const submit = useMutation({
    mutationFn: (json: LeadInput | (LeadFields & { revision: number })) => api<{ href: string; publicationStatus: Lead["publicationStatus"] }>(
      correction ? `/api/leads/${correction.id}` : "/api/leads",
      { method: correction ? "PATCH" : "POST", json },
    ),
    onSuccess: (result) => {
      setSaved(true);
      if (!correction) {
        safeStorage.remove(DRAFT_KEY, "session");
        router.push(result.href);
      }
      void query.invalidateQueries({ queryKey: queryKeys.notifications() });
      router.refresh();
    },
    onError: (error) => setIssue({ message: error.message, fields: error instanceof ClientError ? error.fields : undefined }),
  });

  const err = (name: keyof DraftFields) => issue?.fields?.[name];
  const attributes = (name: keyof DraftFields) => ({
    id: `${prefix}-${name}`,
    "aria-invalid": Boolean(err(name)) || undefined,
    "aria-describedby": err(name) ? `${prefix}-${name}-error` : undefined,
  });
  const fieldNote = (name: keyof DraftFields) => err(name) && <span id={`${prefix}-${name}-error`} className="mt-1 block text-[12px] text-danger">{err(name)}</span>;
  const waiting = submit.isPending || saved;

  return (
    <form className="px-4 py-5 sm:px-7 sm:py-6" aria-label={correction ? "Revise lead" : "Lead brief"} noValidate onSubmit={(event) => {
      event.preventDefault();
      if (waiting) return;
      setIssue(null);
      try {
        const values = parseLeadFields({
          ...fields,
          budgetMin: fields.budgetMin.trim() ? Number(fields.budgetMin) : undefined,
          budgetMax: fields.budgetMax.trim() ? Number(fields.budgetMax) : undefined,
          deadlineAt: fields.deadlineAt ? `${fields.deadlineAt}Z` : null,
        }, { enforceFloor: applyFloor });
        if (!user) {
          if (!demoMode) return;
          saveDraft(fields);
          router.push(`${routes.login()}?next=${encodeURIComponent(routes.leadNew())}`);
        } else if (correction) {
          submit.mutate({ ...values, revision: correction.revision });
        } else {
          submit.mutate({ ...values, submissionKey: saveDraft(fields) });
        }
      } catch (error) {
        setIssue({ message: error instanceof Error ? error.message : "Check the brief and try again.", fields: error instanceof HttpError ? error.fields : undefined });
      }
    }}>
      <fieldset disabled={waiting} className="min-w-0 space-y-5">
        <legend className="sr-only">Lead details</legend>
        {issue && <p role="alert" className="rounded-md border border-danger/40 bg-danger-soft/30 px-3 py-2 text-[13px] text-danger">{issue.message}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className="eyebrow">Type</span>
            <select {...attributes("kind")} value={fields.kind} onChange={(e) => set("kind", e.target.value)} className="field mt-1.5">
              {LEAD_KINDS.map((kind) => <option key={kind} value={kind}>{LEAD_KIND_LABEL[kind]}</option>)}
            </select>{fieldNote("kind")}
          </label>
          <label className="block"><span className="eyebrow">Discipline</span>
            <select {...attributes("category")} value={fields.category} onChange={(e) => set("category", e.target.value)} className="field mt-1.5">
              {LEAD_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
            </select>{fieldNote("category")}
          </label>
          <label className="block"><span className="eyebrow">Public space (optional)</span>
            <select {...attributes("spaceSlug")} value={fields.spaceSlug} onChange={(e) => set("spaceSlug", e.target.value)} className="field mt-1.5">
              <option value="">No linked space</option>
              {spaces.map((space) => <option key={space.slug} value={space.slug}>{space.name}</option>)}
            </select>{fieldNote("spaceSlug")}
          </label>
        </div>
        <label className="block"><span className="eyebrow">Title</span>
          <input {...attributes("title")} value={fields.title} onChange={(e) => set("title", e.target.value)} className="field mt-1.5 text-[15px] font-medium" placeholder="What should the freelancer deliver?" minLength={10} maxLength={180} required />
          {fieldNote("title")}
        </label>
        <label className="block"><span className="eyebrow">Brief · Markdown</span>
          <textarea {...attributes("description")} value={fields.description} onChange={(e) => set("description", e.target.value)} rows={8} className="field mt-1.5 font-mono text-[13px]" placeholder="Describe a specific deliverable, what you will provide, and what a successful result should look like." minLength={60} maxLength={20_000} required />
          {fieldNote("description")}
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block"><span className="eyebrow">Budget unit</span>
            <select {...attributes("budgetUnit")} value={fields.budgetUnit} onChange={(e) => set("budgetUnit", e.target.value)} className="field mt-1.5" required>
              <option value="" disabled>Select unit</option><option value="fixed">Fixed amount</option><option value="hourly">Hourly rate</option>
            </select>{fieldNote("budgetUnit")}
          </label>
          <label className="block"><span className="eyebrow">Currency</span>
            <select {...attributes("currency")} value={fields.currency} onChange={(e) => set("currency", e.target.value)} className="field mt-1.5">
              {LEAD_CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}
            </select>{fieldNote("currency")}
          </label>
          <label className="block"><span className="eyebrow">Budget min</span>
            <input {...attributes("budgetMin")} type="number" min={floor} max={MAX_LEAD_BUDGET} step={1} value={fields.budgetMin} onChange={(e) => set("budgetMin", e.target.value)} className="field num mt-1.5" required />{fieldNote("budgetMin")}
          </label>
          <label className="block"><span className="eyebrow">Budget max</span>
            <input {...attributes("budgetMax")} type="number" min={floor} max={MAX_LEAD_BUDGET} step={1} value={fields.budgetMax} onChange={(e) => set("budgetMax", e.target.value)} className="field num mt-1.5" required />{fieldNote("budgetMax")}
          </label>
        </div>
        {floor > 0 && <p className="text-[12px] text-ink-3">Minimum for this contract: {fields.currency} {floor}{fields.budgetUnit === "hourly" ? " per hour" : " fixed"}.</p>}
        <fieldset className="min-w-0" {...attributes("skillTags")}>
          <legend className="eyebrow">Skills · {fields.skillTags.length}/{MAX_LEAD_SKILLS} selected</legend>
          <p className="mt-1 text-[12px] text-ink-3">Choose at least one skill relevant to the work.</p>
          <div className="mt-2 grid max-h-40 grid-cols-2 gap-x-3 gap-y-2 overflow-auto rounded-md border border-line bg-sunken/40 p-3 sm:grid-cols-3">
            {Object.entries(LEAD_SKILLS).map(([slug, label]) => {
              const checked = fields.skillTags.includes(slug);
              return <label key={slug} className="flex items-start gap-2 text-[12.5px]"><input type="checkbox" checked={checked} disabled={!checked && fields.skillTags.length >= MAX_LEAD_SKILLS} onChange={() => set("skillTags", checked ? fields.skillTags.filter((skill) => skill !== slug) : [...fields.skillTags, slug])} className="mt-0.5 accent-[var(--ember)]" />{label}</label>;
            })}
          </div>
          {fieldNote("skillTags")}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="eyebrow">Location</span>
            <input {...attributes("location")} value={fields.location} onChange={(e) => set("location", e.target.value)} className="field mt-1.5" maxLength={80} placeholder="Remote" />{fieldNote("location")}
          </label>
          <label className="block"><span className="eyebrow">Bid deadline (UTC, optional)</span>
            <input {...attributes("deadlineAt")} type="datetime-local" value={fields.deadlineAt} onChange={(e) => set("deadlineAt", e.target.value)} className="field mt-1.5" />{fieldNote("deadlineAt")}
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="max-w-md text-[12.5px] text-ink-3">
            {!user ? "Your draft stays in this browser tab. Signing in won’t submit it." : "Only you and site reviewers can see the brief until it is approved."}
          </p>
          <div className="flex flex-wrap gap-2">
            {!correction && <Link href={routes.leads()} className="btn">Back to leads</Link>}
            <button type="submit" className="btn btn-primary" disabled={waiting || (!user && !demoMode)}>
              {waiting ? "Saving…" : correction ? "Resubmit for review" : user ? "Submit for review" : demoMode ? "Continue to sign in" : "Sign-in unavailable"}
            </button>
          </div>
        </div>
      </fieldset>
    </form>
  );
}
