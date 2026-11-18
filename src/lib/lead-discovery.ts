import { LEAD_CATEGORIES } from "./constants";
import { HttpError } from "./errors";
import { LEAD_BUDGET_UNITS, LEAD_CURRENCIES, LEAD_KINDS, LEAD_SKILLS, MAX_LEAD_BUDGET } from "./lead-input";
import { isRankMode, type RankMode } from "./sorting";

export const LEAD_PAGE_SIZE = 25;
export const MAX_LEAD_PAGE_SIZE = 50;
export const LEAD_RANK_WINDOW = 400;
export const MAX_FILTER_SKILLS = 6;

export interface LeadFilters {
  sort: RankMode;
  category?: (typeof LEAD_CATEGORIES)[number];
  kind?: (typeof LEAD_KINDS)[number];
  verifiedOnly?: boolean;
  openOnly?: boolean;
  currency?: (typeof LEAD_CURRENCIES)[number];
  unit?: (typeof LEAD_BUDGET_UNITS)[number];
  min?: number;
  max?: number;
  skills: string[];
}

const SKILL_ALIASES = new Map([
  ["nodejs", "node-js"], ["node.js", "node-js"], ["nextjs", "next-js"], ["next.js", "next-js"],
  ["reactjs", "react"], ["react.js", "react"], ["postgres", "postgresql"], ["a11y", "accessibility"],
]);

function invalid(field: string, message: string): never {
  throw new HttpError(422, message, "invalid_lead_filters", { [field]: message });
}

function single(params: URLSearchParams, name: string): string | undefined {
  const values = params.getAll(name);
  if (values.length > 1) invalid(name, `Send only one ${name} value.`);
  return values[0];
}

function choice<const T extends readonly string[]>(params: URLSearchParams, name: string, values: T, message: string): T[number] | undefined {
  const value = single(params, name);
  if (value === undefined) return undefined;
  if (!values.includes(value)) invalid(name, message);
  return value;
}

function flag(params: URLSearchParams, name: string): boolean {
  return choice(params, name, ["0", "1"], `Use 1 or 0 for ${name}.`) === "1";
}

function amount(params: URLSearchParams, name: "min" | "max"): number | undefined {
  const value = single(params, name);
  if (value === undefined) return undefined;
  if (!/^\d{1,8}$/.test(value) || Number(value) > MAX_LEAD_BUDGET) invalid(name, "Enter a whole amount between 0 and 10,000,000.");
  return Number(value);
}

function readSkills(params: URLSearchParams): string[] {
  const values = params.getAll("skill");
  if (values.length > MAX_FILTER_SKILLS * 4) invalid("skill", `Choose up to ${MAX_FILTER_SKILLS} skills.`);
  const skills = new Set<string>();
  for (const value of values) {
    const raw = value.trim().toLowerCase();
    const skill = SKILL_ALIASES.get(raw) ?? raw;
    if (value.length > 48 || !Object.hasOwn(LEAD_SKILLS, skill)) invalid("skill", "Choose skills from the catalogue.");
    skills.add(skill);
  }
  if (skills.size > MAX_FILTER_SKILLS) invalid("skill", `Choose up to ${MAX_FILTER_SKILLS} skills.`);
  return [...skills].sort();
}

export function hasLeadFilters(f: LeadFilters): boolean {
  return Boolean(f.category || f.kind || f.verifiedOnly || f.openOnly || f.currency || f.unit || f.min !== undefined || f.max !== undefined || f.skills.length);
}

/** One contract for SSR, form submission, and the API. Ranking is a separate unfiltered mode. */
export function parseLeadFilters(params: URLSearchParams): LeadFilters {
  const sort = single(params, "sort") ?? "new";
  if (!isRankMode(sort)) invalid("sort", "Choose New, Hot, or Best.");
  const filters: LeadFilters = {
    sort,
    category: choice(params, "category", LEAD_CATEGORIES, "Choose a valid discipline."),
    kind: choice(params, "kind", LEAD_KINDS, "Choose a valid lead type."),
    currency: choice(params, "currency", LEAD_CURRENCIES, "Choose USD, EUR, or GBP."),
    unit: choice(params, "unit", LEAD_BUDGET_UNITS, "Choose fixed or hourly."),
    min: amount(params, "min"),
    max: amount(params, "max"),
    verifiedOnly: flag(params, "verified"),
    openOnly: flag(params, "active"),
    skills: readSkills(params),
  };
  const { min, max, currency, unit } = filters;
  if (min !== undefined || max !== undefined) {
    if (!currency) invalid("currency", "Choose a currency to filter by amount.");
    if (!unit) invalid("unit", "Choose fixed or hourly to filter by amount.");
    if (min !== undefined && max !== undefined && min > max) invalid("max", "Maximum budget must be at least the minimum.");
  }
  if (sort !== "new" && hasLeadFilters(filters)) invalid("sort", "Filters are available in New. Hot and Best are unfiltered.");
  return filters;
}

export function leadFiltersParams(f: LeadFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.sort !== "new") params.set("sort", f.sort);
  if (f.category) params.set("category", f.category);
  if (f.kind) params.set("kind", f.kind);
  if (f.currency) params.set("currency", f.currency);
  if (f.unit) params.set("unit", f.unit);
  if (f.min !== undefined) params.set("min", String(f.min));
  if (f.max !== undefined) params.set("max", String(f.max));
  if (f.openOnly) params.set("active", "1");
  if (f.verifiedOnly) params.set("verified", "1");
  for (const skill of f.skills) params.append("skill", skill);
  return params;
}

export function readLeadPageFilters(values: Record<string, string | string[] | undefined>): { filters: LeadFilters; filterError?: string } {
  const params = new URLSearchParams();
  for (const [key, valuesForKey] of Object.entries(values)) {
    for (const value of typeof valuesForKey === "string" ? [valuesForKey] : valuesForKey ?? []) params.append(key, value);
  }
  try {
    return { filters: parseLeadFilters(params) };
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return { filters: { sort: "new", skills: [] }, filterError: error.message };
  }
}

export function parseLeadAuthor(params: URLSearchParams): string | undefined {
  const author = single(params, "author");
  if (author !== undefined && !/^[a-z0-9][a-z0-9_.-]{0,31}$/i.test(author)) invalid("author", "Choose a valid author handle.");
  return author;
}

export type LeadCursorScope = RankMode | "saved";
type SeekCursor = { scope: "new" | "saved"; time: string; id: number };
type RankCursor = { scope: "hot" | "top"; offset: number };
export type LeadPaging = { limit: number; cursor?: SeekCursor | RankCursor };

// Timestamps in PostgreSQL have microsecond precision. Never cast the seek boundary to a Date.
export function leadSeekToken(scope: SeekCursor["scope"], time: string, id: number): string {
  return `${scope}:${time}:${id}`;
}

function badCursor(): never {
  throw new HttpError(400, "Invalid lead cursor. Start again from the first page.", "invalid_cursor");
}

export function parseLeadPaging(params: URLSearchParams, scope: LeadCursorScope): LeadPaging {
  const limit = single(params, "limit") ?? String(LEAD_PAGE_SIZE);
  if (!/^\d{1,2}$/.test(limit) || Number(limit) < 1 || Number(limit) > MAX_LEAD_PAGE_SIZE) {
    invalid("limit", `Page size must be between 1 and ${MAX_LEAD_PAGE_SIZE}.`);
  }
  const paging: LeadPaging = { limit: Number(limit) };
  const tokens = params.getAll("cursor");
  if (tokens.length > 1) badCursor();
  const token = tokens[0];
  // Retain the existing initial-page sentinel, but never apply numeric offsets to New.
  if (token === undefined || token === "0") return paging;
  if (token.length > 64 || !token.startsWith(`${scope}:`)) badCursor();
  const value = token.slice(scope.length + 1);
  if (scope === "hot" || scope === "top") {
    if (!/^[1-9]\d{0,2}$/.test(value) || Number(value) >= LEAD_RANK_WINDOW) badCursor();
    return { ...paging, cursor: { scope, offset: Number(value) } };
  }
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z):([1-9]\d{0,9})$/.exec(value);
  if (!match || match[1].startsWith("0000") || Number(match[2]) > 2_147_483_647) badCursor();
  const time = match[1];
  const date = new Date(time);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== `${time.slice(0, 23)}Z`) badCursor();
  return { ...paging, cursor: { scope, time, id: Number(match[2]) } };
}
