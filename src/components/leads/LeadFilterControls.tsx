"use client";

import { SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { LEAD_CATEGORIES } from "@/lib/constants";
import { HttpError } from "@/lib/errors";
import { hasLeadFilters, LEAD_RANK_WINDOW, leadFiltersParams, MAX_FILTER_SKILLS, parseLeadFilters, type LeadFilters } from "@/lib/lead-discovery";
import { LEAD_CURRENCIES, LEAD_SKILLS } from "@/lib/lead-input";
import { cn, routes } from "@/lib/utils";

function leadHref(filters: LeadFilters, author?: string): string {
  const params = leadFiltersParams(filters);
  if (author) params.set("tab", "leads");
  const path = author ? routes.profile(author) : routes.leads();
  return params.size ? `${path}?${params}` : path;
}

const sorts = [{ sort: "new", label: "New" }, { sort: "hot", label: "Hot" }, { sort: "top", label: "Best" }] as const;
const skillOptions = Object.entries(LEAD_SKILLS).sort((a, b) => a[1].localeCompare(b[1], "en"));

export function LeadFilterControls({ filters, author, filterError }: { filters: LeadFilters; author?: string; filterError?: string }) {
  const router = useRouter();
  const [navigating, startTransition] = useTransition();
  const [skills, setSkills] = useState(filters.skills);
  const [choice, chooseSkill] = useState("");
  const [error, setError] = useState<HttpError | null>(null);
  const errorId = useId();
  const hasFilters = hasLeadFilters(filters);
  const message = error?.message ?? filterError;
  const clearHref = leadHref({ sort: "new", skills: [] }, author);
  const fieldStatus = (name: string) => error?.fields?.[name] ? { "aria-invalid": true, "aria-describedby": errorId } : {};

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === "string" && value.trim()) params.append(key, value.trim());
    }
    for (const skill of skills) params.append("skill", skill);
    try {
      const href = leadHref(parseLeadFilters(params), author);
      setError(null);
      startTransition(() => router.push(href));
    } catch (error) {
      if (error instanceof HttpError) setError(error);
      else throw error;
    }
  }

  return (
    <div className="panel mb-3 rounded-lg">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2">
        <nav className="flex items-center gap-1" aria-label="Lead order">
          {sorts.map(({ sort, label }) => (
            <Link key={sort} href={leadHref(sort === "new" && filters.sort === "new" && !filterError ? filters : { sort, skills: [] }, author)}
              aria-current={filters.sort === sort && !filterError ? "page" : undefined}
              className={cn("flex h-10 items-center border-b-2 px-3 text-[13px] font-semibold", filters.sort === sort && !filterError ? "border-ember text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
              {label}
            </Link>
          ))}
        </nav>
        <p className="px-2 py-1 text-[12px] text-ink-3">{filters.sort === "new" ? "Budget and skill filters apply to New." : `Unfiltered ranking of the ${LEAD_RANK_WINDOW} newest public leads.`}</p>
      </div>
      {filters.sort === "new" && (
        <details open={hasFilters || Boolean(filterError) || undefined} className="border-t border-line">
          <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-semibold">
            <span className="ml-1 inline-flex items-center gap-1.5"><SlidersHorizontal size={14} aria-hidden="true" /> Filter leads {hasFilters && <span className="tag tag-ember">Applied</span>}</span>
          </summary>
          <form noValidate onSubmit={apply} className="space-y-3 px-4 pb-4 pt-1" aria-label="Lead filters" aria-busy={navigating}>
            {message && <p id={errorId} role="alert" className="rounded-md border border-danger/40 px-3 py-2 text-[13px] text-danger">{message}</p>}
            <div className="grid grid-cols-2 gap-2">
              <label className="min-w-0 space-y-1 text-[12px] text-ink-2">Lead type
                <select name="kind" className="field" defaultValue={filters.kind ?? ""} {...fieldStatus("kind")}>
                  <option value="">All types</option><option value="contract">Contracts</option><option value="bounty">Bounties</option><option value="job">Roles</option>
                </select>
              </label>
              <label className="min-w-0 space-y-1 text-[12px] text-ink-2">Discipline
                <select name="category" className="field" defaultValue={filters.category ?? ""} {...fieldStatus("category")}>
                  <option value="">All disciplines</option>
                  {LEAD_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[12.5px] text-ink-2">
              <label className="inline-flex items-center gap-1.5"><input type="checkbox" name="active" value="1" defaultChecked={filters.openOnly} className="accent-[var(--ember)]" /> Accepting pitches</label>
              <label className="inline-flex items-center gap-1.5"><input type="checkbox" name="verified" value="1" defaultChecked={filters.verifiedOnly} className="accent-[var(--ember)]" /> Verified only</label>
            </div>
            <fieldset className="min-w-0 border-t border-line pt-2">
              <legend className="text-[13px] font-semibold">Budget</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="min-w-0 space-y-1 text-[12px] text-ink-2">Currency
                  <select name="currency" className="field" defaultValue={filters.currency ?? ""} {...fieldStatus("currency")}>
                    <option value="">Any currency</option>{LEAD_CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}
                  </select>
                </label>
                <label className="min-w-0 space-y-1 text-[12px] text-ink-2">Budget unit
                  <select name="unit" className="field" defaultValue={filters.unit ?? ""} {...fieldStatus("unit")}>
                    <option value="">Any unit</option><option value="fixed">Fixed</option><option value="hourly">Hourly</option>
                  </select>
                </label>
                <label className="min-w-0 space-y-1 text-[12px] text-ink-2">Min budget
                  <input name="min" inputMode="numeric" maxLength={8} placeholder="Any" className="field num" defaultValue={filters.min} {...fieldStatus("min")} />
                </label>
                <label className="min-w-0 space-y-1 text-[12px] text-ink-2">Max budget
                  <input name="max" inputMode="numeric" maxLength={8} placeholder="Any" className="field num" defaultValue={filters.max} {...fieldStatus("max")} />
                </label>
              </div>
              <p className="mt-1.5 text-[12px] text-ink-3">Pick a currency and unit to compare amounts. A lead matches if its budget overlaps your range.</p>
            </fieldset>
            <fieldset className="min-w-0 border-t border-line pt-2">
              <legend className="text-[13px] font-semibold">Skills</legend>
              <div className="flex items-center gap-2">
                <select aria-label="Choose a skill" value={choice} onChange={(e) => chooseSkill(e.target.value)} className="field min-w-0 max-w-64" disabled={skills.length === MAX_FILTER_SKILLS} {...fieldStatus("skill")}>
                  <option value="">Choose a skill</option>
                  {skillOptions.filter(([skill]) => !skills.includes(skill)).map(([skill, label]) => <option value={skill} key={skill}>{label}</option>)}
                </select>
                <button type="button" className="btn shrink-0" disabled={!choice || skills.length === MAX_FILTER_SKILLS} onClick={() => { setSkills([...skills, choice]); chooseSkill(""); }}>Add skill</button>
              </div>
              {skills.length > 0 && <ul aria-label="Selected skills" className="mt-2 flex flex-wrap gap-1.5">{skills.map((skill) => (
                <li key={skill}><button type="button" aria-label={`Remove ${LEAD_SKILLS[skill]}`} className="tag tag-ember normal-case" onClick={() => setSkills(skills.filter((s) => s !== skill))}>
                  {LEAD_SKILLS[skill]} <X size={12} aria-hidden="true" />
                </button></li>
              ))}</ul>}
              <p className="mt-1.5 text-[12px] text-ink-3">Match any selected skill · {skills.length} of {MAX_FILTER_SKILLS}</p>
            </fieldset>
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className="btn btn-primary" disabled={navigating}>{navigating ? "Applying…" : "Apply filters"}</button>
              {(hasFilters || filterError) && <Link href={clearHref} className="btn btn-ghost">Clear filters</Link>}
            </div>
          </form>
        </details>
      )}
    </div>
  );
}
