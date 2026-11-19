import { LEAD_CATEGORIES } from "./constants";
import { HttpError } from "./errors";

export const LEAD_KINDS = ["contract", "bounty", "job"] as const;
export const LEAD_CURRENCIES = ["USD", "EUR", "GBP"] as const;
export const LEAD_BUDGET_UNITS = ["fixed", "hourly"] as const;
export const MAX_LEAD_BUDGET = 10_000_000;
export const MAX_LEAD_SKILLS = 6;
export const MAX_LEAD_TIMELINE = 160;

export const CONTRACT_FLOORS: Record<(typeof LEAD_CURRENCIES)[number], Record<(typeof LEAD_BUDGET_UNITS)[number], number>> = {
  USD: { fixed: 50, hourly: 20 },
  EUR: { fixed: 50, hourly: 20 },
  GBP: { fixed: 40, hourly: 16 },
};

export const LEAD_SKILLS: Record<string, string> = {
  typescript: "TypeScript", javascript: "JavaScript", react: "React", "next-js": "Next.js", "node-js": "Node.js",
  python: "Python", go: "Go", rust: "Rust", java: "Java", postgresql: "PostgreSQL", sql: "SQL",
  "react-native": "React Native", flutter: "Flutter", swift: "Swift", kotlin: "Kotlin", accessibility: "Accessibility",
  aws: "AWS", docker: "Docker", kubernetes: "Kubernetes", terraform: "Terraform", "ci-cd": "CI/CD",
  figma: "Figma", "ux-research": "UX research", "design-systems": "Design systems",
  security: "Security", "data-engineering": "Data engineering", analytics: "Analytics", "machine-learning": "Machine learning",
  "product-management": "Product management", testing: "Testing", documentation: "Documentation",
};

export interface LeadFields {
  title: string;
  description: string;
  deliveryTimeline: string;
  category: (typeof LEAD_CATEGORIES)[number];
  kind: (typeof LEAD_KINDS)[number];
  budgetMin: number;
  budgetMax: number;
  currency: (typeof LEAD_CURRENCIES)[number];
  budgetUnit: (typeof LEAD_BUDGET_UNITS)[number];
  skillTags: string[];
  deadlineAt: string | null;
  location: string;
  spaceSlug: string | null;
}

export type LeadInput = LeadFields & { submissionKey: string };

export function leadBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Expected an object", "bad_request");
  return value as Record<string, unknown>;
}

function fieldError(field: string, message: string): never {
  throw new HttpError(422, message, "invalid_lead", { [field]: message });
}

function trimmed(value: unknown, field: string, label: string, min: number, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min || text.length > max) fieldError(field, `${label} must be ${min}–${max.toLocaleString("en-US")} characters.`);
  if (text.includes("\0") || /[\uD800-\uDFFF]/u.test(text)) fieldError(field, `${label} contains an unsupported character.`);
  return text;
}

function choice<const T extends readonly string[]>(value: unknown, choices: T, field: string, label: string): T[number] {
  if (typeof value !== "string" || !choices.includes(value)) fieldError(field, `Choose a valid ${label}.`);
  return value as T[number];
}

function amount(value: unknown, field: string, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_LEAD_BUDGET) {
    fieldError(field, `${label} must be a whole number between 0 and ${MAX_LEAD_BUDGET.toLocaleString("en-US")}.`);
  }
  return value;
}

export function parseSubmissionKey(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) {
    fieldError("submissionKey", "A valid draft key is required.");
  }
  return value.toLowerCase();
}

export function parseLeadRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value >= 2_147_483_647) {
    fieldError("revision", "A current submission revision is required.");
  }
  return value;
}

/** Same validation in the composer and handlers. Existing rows are not coerced into these rules. */
export function parseLeadFields(value: unknown, { now = Date.now(), enforceFloor = true }: { now?: number; enforceFloor?: boolean } = {}): LeadFields {
  const body = leadBody(value);
  const title = trimmed(body.title, "title", "Title", 10, 180);
  const description = trimmed(body.description, "description", "Brief", 60, 20_000);
  const deliveryTimeline = trimmed(body.deliveryTimeline, "deliveryTimeline", "Delivery timeline", 3, MAX_LEAD_TIMELINE);
  if (/[\r\n\u2028\u2029]/u.test(deliveryTimeline)) fieldError("deliveryTimeline", "Enter a delivery timeline on one line.");
  const category = choice(body.category, LEAD_CATEGORIES, "category", "discipline");
  const kind = choice(body.kind, LEAD_KINDS, "kind", "lead type");
  const currency = choice(body.currency, LEAD_CURRENCIES, "currency", "currency");
  const budgetUnit = choice(body.budgetUnit, LEAD_BUDGET_UNITS, "budgetUnit", "budget unit");
  const budgetMin = amount(body.budgetMin, "budgetMin", "Minimum budget");
  const budgetMax = amount(body.budgetMax, "budgetMax", "Maximum budget");
  if (budgetMax === 0) fieldError("budgetMax", "Enter a positive budget for the work.");
  if (budgetMax < budgetMin) fieldError("budgetMax", "Maximum budget must be at least the minimum.");
  if (enforceFloor && kind === "contract") {
    const floor = CONTRACT_FLOORS[currency][budgetUnit];
    if (budgetMin < floor) fieldError("budgetMin", `The minimum for a ${budgetUnit} contract is ${currency} ${floor}${budgetUnit === "hourly" ? " per hour" : ""}.`);
  }
  if (!Array.isArray(body.skillTags) || body.skillTags.length > 32) fieldError("skillTags", "Choose 1–6 relevant skills.");
  const skills = new Set<string>();
  for (const skill of body.skillTags) {
    if (typeof skill !== "string" || !Object.hasOwn(LEAD_SKILLS, skill.trim().toLowerCase())) fieldError("skillTags", "Choose skills from the catalogue.");
    skills.add(skill.trim().toLowerCase());
  }
  if (skills.size < 1 || skills.size > MAX_LEAD_SKILLS) fieldError("skillTags", "Choose 1–6 relevant skills.");

  let deadlineAt: string | null = null;
  if (body.deadlineAt != null && body.deadlineAt !== "") {
    const value = body.deadlineAt;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
      fieldError("deadlineAt", "Enter a deadline with a valid date, time and timezone.");
    }
    const instant = Date.parse(value);
    const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(instant) || !Number.isFinite(day.getTime()) || !day.toISOString().startsWith(value.slice(0, 10)) || instant <= now) {
      fieldError("deadlineAt", "Choose a valid deadline in the future.");
    }
    deadlineAt = new Date(instant).toISOString();
  }

  if (body.location != null && (typeof body.location !== "string" || body.location.trim().length > 80)) fieldError("location", "Location must be at most 80 characters.");
  const location = typeof body.location === "string" ? body.location.trim() || "Remote" : "Remote";
  if (location.includes("\0") || /[\uD800-\uDFFF]/u.test(location)) fieldError("location", "Location contains an unsupported character.");
  let spaceSlug: string | null = null;
  if (body.spaceSlug != null && body.spaceSlug !== "") spaceSlug = trimmed(body.spaceSlug, "spaceSlug", "Space", 1, 48).toLowerCase();
  return { title, description, deliveryTimeline, category, kind, budgetMin, budgetMax, currency, budgetUnit, skillTags: [...skills], deadlineAt, location, spaceSlug };
}
