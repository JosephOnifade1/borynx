import { HttpError } from "./errors";
import { companyWebsite as httpsProfileUrl, PROFILE_URL_MAX } from "./profile-input";

export const PROJECT_LIMITS = {
  projects: 6,
  title: 120,
  description: 2_000,
  roleOutcome: 500,
  url: PROFILE_URL_MAX,
  tags: 8,
  tag: 24,
  coverBytes: 3 * 1024 * 1024,
  altText: 160,
  reason: 500,
} as const;

export interface ProjectFields {
  title: string;
  description: string;
  roleOutcome: string | null;
  liveUrl: string | null;
  repoUrl: string | null;
  techTags: string[];
}

export interface PublicProject extends ProjectFields {
  id: number;
  coverUrl: string | null;
  coverAlt: string | null;
}

export interface OwnedProject extends PublicProject {
  isPublished: boolean;
  hidden: boolean;
}

export type ProjectPatch = Partial<ProjectFields & { isPublished: boolean }>;
export type ProjectDecision = { action: "hide" | "restore"; reason: string };
const fields = ["title", "description", "roleOutcome", "liveUrl", "repoUrl", "techTags"] as const;

function invalid(field: string, message: string): never {
  throw new HttpError(422, message, "invalid_project", { [field]: message });
}

function projectBody(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Expected a JSON object", "bad_request");
  for (const key of Object.keys(value)) if (!allowed.includes(key)) invalid(key, "This project field cannot be changed here.");
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, label: string, min: number, max: number, multiline = false): string {
  const clean = typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
  if (typeof value !== "string" || clean.length < min || clean.length > max) {
    invalid(field, min ? `${label} must be ${min}–${max} characters.` : `${label} can be at most ${max} characters.`);
  }
  if (/[\uD800-\uDFFF]/u.test(clean) || [...clean].some((char) => {
    const code = char.charCodeAt(0);
    return (code < 32 && !(multiline && (char === "\n" || char === "\t"))) || code === 127;
  })) invalid(field, `${label} contains an unsupported character.`);
  return clean;
}

const title = (value: unknown) => text(value, "title", "Title", 3, PROJECT_LIMITS.title);
const description = (value: unknown) => text(value, "description", "Description", 20, PROJECT_LIMITS.description, true);
const roleOutcome = (value: unknown) => value == null ? null : text(value, "roleOutcome", "Role and outcome", 0, PROJECT_LIMITS.roleOutcome, true) || null;

function projectLink(value: unknown, field: "liveUrl" | "repoUrl") {
  if (value == null) return null;
  const url = typeof value === "string" ? httpsProfileUrl(value) : null;
  if (!url) invalid(field, "Use an HTTPS link without credentials, or leave it blank.");
  return url;
}

function techTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > PROJECT_LIMITS.tags) invalid("techTags", "Add 1–8 technology tags.");
  return [...new Set(value.map((tag: unknown) => {
    const clean = text(tag, "techTags", "Each tag", 1, PROJECT_LIMITS.tag).normalize("NFKC").toLowerCase().replace(/ +/g, " ").trim();
    if (clean.length > PROJECT_LIMITS.tag || !/^[\p{L}\p{M}\p{N} .+#/_-]+$/u.test(clean) || !/[\p{L}\p{N}]/u.test(clean)) {
      invalid("techTags", "Use letters, numbers, spaces or . + # / _ - in a tag.");
    }
    return clean;
  }))];
}

export function parseProjectCreate(value: unknown): ProjectFields {
  const body = projectBody(value, fields);
  return {
    title: title(body.title),
    description: description(body.description),
    roleOutcome: roleOutcome(body.roleOutcome),
    liveUrl: projectLink(body.liveUrl, "liveUrl"),
    repoUrl: projectLink(body.repoUrl, "repoUrl"),
    techTags: techTags(body.techTags),
  };
}

export function parseProjectPatch(value: unknown): ProjectPatch {
  const body = projectBody(value, [...fields, "isPublished"]);
  const patch: ProjectPatch = {};
  if (body.title !== undefined) patch.title = title(body.title);
  if (body.description !== undefined) patch.description = description(body.description);
  if (body.roleOutcome !== undefined) patch.roleOutcome = roleOutcome(body.roleOutcome);
  if (body.liveUrl !== undefined) patch.liveUrl = projectLink(body.liveUrl, "liveUrl");
  if (body.repoUrl !== undefined) patch.repoUrl = projectLink(body.repoUrl, "repoUrl");
  if (body.techTags !== undefined) patch.techTags = techTags(body.techTags);
  if (body.isPublished !== undefined) {
    if (typeof body.isPublished !== "boolean") invalid("isPublished", "Choose published or draft.");
    patch.isPublished = body.isPublished;
  }
  return patch;
}

const isProjectId = (id: unknown): id is number => typeof id === "number" && Number.isInteger(id) && id > 0 && id <= 2_147_483_647;

export function parseProjectId(id: string | undefined): number {
  const n = id && /^\d{1,10}$/.test(id) ? Number(id) : NaN;
  if (!isProjectId(n)) throw new HttpError(404, "Project not found", "not_found");
  return n;
}

export function parseProjectOrder(value: unknown): number[] {
  const { ids } = projectBody(value, ["ids"]);
  if (!Array.isArray(ids) || ids.length > PROJECT_LIMITS.projects || !ids.every(isProjectId) || new Set(ids).size !== ids.length) {
    invalid("ids", "Provide each project ID exactly once, in the desired order.");
  }
  return ids;
}

export function parseProjectDecision(value: unknown): ProjectDecision {
  const { action, reason } = projectBody(value, ["action", "reason"]);
  if (action !== "hide" && action !== "restore") invalid("action", "Choose hide or restore.");
  return { action, reason: text(reason, "reason", "Reason", 1, PROJECT_LIMITS.reason, true) };
}

export function parseCoverAlt(value: unknown): string {
  return text(value ?? "", "altText", "Cover description", 0, PROJECT_LIMITS.altText);
}
