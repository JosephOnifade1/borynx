import type { User } from "../db/schema";
import { HttpError } from "./errors";
import { LEAD_CURRENCIES } from "./lead-input";

export const PROFILE_CURRENCIES = LEAD_CURRENCIES;
export const MAX_HOURLY_RATE = 10_000_000;
export const COMPANY_NAME_MAX = 100;
export const PROFILE_URL_MAX = 255;

const PROFILE_FIELDS = new Set([
  "displayName", "headline", "bio", "skills", "avatarHue", "githubUrl", "portfolioUrl",
  "lookingToHire", "availableForWork", "companyName", "companyUrl", "hourlyRate", "hourlyCurrency",
]);

export type ProfilePreferences = Pick<User, "lookingToHire" | "availableForWork" | "companyName" | "companyUrl" | "hourlyRate" | "hourlyCurrency">;
export type EditableProfile = Pick<User, "username" | "displayName" | "headline" | "bio" | "skills" | "avatarHue" | "githubUrl" | "portfolioUrl"> & ProfilePreferences;
type ProfilePatch = Partial<Omit<EditableProfile, "username"> & Pick<User, "companyNamePublic">>;
type Rate = Pick<User, "hourlyRate" | "hourlyCurrency">;

/** Do not serialize the user's private intake name, even into their own editor's initial state. */
export function toProfilePreferences(user: ProfilePreferences & Pick<User, "companyNamePublic">): ProfilePreferences {
  return {
    lookingToHire: user.lookingToHire,
    availableForWork: user.availableForWork,
    companyName: user.companyNamePublic ? user.companyName : null,
    companyUrl: user.companyUrl,
    hourlyRate: user.hourlyRate,
    hourlyCurrency: user.hourlyCurrency,
  };
}

export function toEditableProfile(user: User): EditableProfile {
  return {
    username: user.username,
    displayName: user.displayName,
    headline: user.headline,
    bio: user.bio,
    skills: user.skills,
    avatarHue: user.avatarHue,
    githubUrl: user.githubUrl,
    portfolioUrl: user.portfolioUrl,
    ...toProfilePreferences(user),
  };
}

function fieldError(field: string, message: string): never {
  throw new HttpError(422, message, "invalid_profile", { [field]: message });
}

function text(value: unknown, field: string, label: string, min: number, max: number): string {
  const clean = typeof value === "string" ? value.trim() : "";
  if (typeof value !== "string" || clean.length < min || clean.length > max) {
    fieldError(field, min > 0 ? `${label} must be ${min}–${max} characters.` : `${label} must be at most ${max} characters.`);
  }
  if (clean.includes("\0") || /[\uD800-\uDFFF]/u.test(clean) ||
      (field !== "bio" && [...clean].some((c) => c.charCodeAt(0) < 32))) {
    fieldError(field, `${label} contains an unsupported character.`);
  }
  return clean;
}

function profileLink(value: string, httpsOnly: boolean): string | null {
  const input = value.trim();
  if (input.length > PROFILE_URL_MAX || !/^https?:\/\//i.test(input) || /[\\\s\uD800-\uDFFF]/u.test(input) ||
      [...input].some((c) => c.charCodeAt(0) < 32)) return null;
  try {
    const url = new URL(input);
    if (url.username || url.password || url.href.length > PROFILE_URL_MAX || (httpsOnly && url.protocol !== "https:")) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** We link to a company website, never fetch it or derive trust from it. */
export function companyWebsite(value: string | null): string | null {
  return value ? profileLink(value, true) : null;
}

function isProfileCurrency(value: unknown): value is (typeof PROFILE_CURRENCIES)[number] {
  return PROFILE_CURRENCIES.some((currency) => value === currency);
}

function parseRate(body: Record<string, unknown>, current: Rate): Rate {
  const { hourlyRate, hourlyCurrency } = body;
  if (hourlyRate === null || hourlyCurrency === null) {
    if (hourlyRate != null || hourlyCurrency != null) {
      fieldError(hourlyRate === null ? "hourlyRate" : "hourlyCurrency", "Set both the amount and currency, or clear the rate.");
    }
    return { hourlyRate: null, hourlyCurrency: null };
  }
  const rate = hourlyRate === undefined ? current.hourlyRate : hourlyRate;
  const currency = hourlyCurrency === undefined ? current.hourlyCurrency : hourlyCurrency;
  if (typeof rate !== "number" || !Number.isInteger(rate) || rate < 1 || rate > MAX_HOURLY_RATE) {
    fieldError("hourlyRate", `Enter a whole hourly amount between 1 and ${MAX_HOURLY_RATE.toLocaleString("en-US")}.`);
  }
  if (!isProfileCurrency(currency)) fieldError("hourlyCurrency", "Choose USD, EUR, or GBP for your hourly rate.");
  return { hourlyRate: rate, hourlyCurrency: currency };
}

/** Only the provided preferences change. Resolve partial rate edits against the locked user row. */
export function parseProfilePatch(value: unknown, currentRate: Rate): ProfilePatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Expected a profile object", "bad_request");
  const body = value as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!PROFILE_FIELDS.has(key)) fieldError(key, "This profile field cannot be changed.");
  }
  const patch: ProfilePatch = {};
  if (body.displayName !== undefined) patch.displayName = text(body.displayName, "displayName", "Display name", 2, 80);
  if (body.headline !== undefined) patch.headline = text(body.headline, "headline", "Headline", 0, 140);
  if (body.bio !== undefined) patch.bio = text(body.bio, "bio", "Bio", 0, 2000);
  if (body.skills !== undefined) {
    if (!Array.isArray(body.skills) || body.skills.length > 20) fieldError("skills", "Enter up to 20 skills.");
    patch.skills = body.skills.map((skill) => text(skill, "skills", "Skill", 1, 30));
  }
  if (body.avatarHue !== undefined) {
    if (typeof body.avatarHue !== "number" || !Number.isInteger(body.avatarHue) || body.avatarHue < 0 || body.avatarHue > 360) {
      fieldError("avatarHue", "Choose a whole hue between 0 and 360.");
    }
    patch.avatarHue = body.avatarHue;
  }
  for (const [field, label] of [["githubUrl", "GitHub URL"], ["portfolioUrl", "Portfolio URL"]] as const) {
    const raw = body[field];
    if (raw === undefined) continue;
    if (raw === null || (typeof raw === "string" && !raw.trim())) { patch[field] = null; continue; }
    if (typeof raw !== "string") fieldError(field, `Enter a valid ${label}.`);
    // The existing form accepts a hostname without a scheme for these two legacy fields.
    const url = profileLink(/^https?:\/\//i.test(raw.trim()) ? raw : `https://${raw.trim()}`, false);
    if (!url) fieldError(field, `Enter a valid ${label}.`);
    patch[field] = url;
  }
  for (const field of ["lookingToHire", "availableForWork"] as const) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "boolean") fieldError(field, "Choose on or off.");
    patch[field] = body[field];
  }
  if (body.companyName !== undefined) {
    patch.companyName = body.companyName === null ? null : text(body.companyName, "companyName", "Company name", 1, COMPANY_NAME_MAX);
    patch.companyNamePublic = patch.companyName !== null;
  }
  if (body.companyUrl !== undefined) {
    const url = typeof body.companyUrl === "string" ? companyWebsite(body.companyUrl) : null;
    if (body.companyUrl !== null && !url) fieldError("companyUrl", "Enter an HTTPS website without credentials, or clear it.");
    patch.companyUrl = url;
  }
  if (body.hourlyRate !== undefined || body.hourlyCurrency !== undefined) Object.assign(patch, parseRate(body, currentRate));
  return patch;
}
