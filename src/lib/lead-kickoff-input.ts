import { HttpError } from "./errors";

export const KICKOFF_LIMITS = { note: { min: 10, max: 1_000 }, contact: { min: 3, max: 200 } } as const;
export type KickoffInput = { note: string; contact: string; startDate: string };

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Expected a JSON object", "bad_request");
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new HttpError(422, "Unexpected kickoff fields", "invalid_kickoff");
  return value as Record<string, unknown>;
}

function invalid(field: keyof KickoffInput | "action", message: string): never {
  throw new HttpError(422, message, "invalid_kickoff", { [field]: message });
}

function text(value: unknown, field: "note" | "contact") {
  const { min, max } = KICKOFF_LIMITS[field];
  const clean = typeof value === "string" ? value.trim().replace(/\r\n?/g, "\n") : "";
  const length = clean.length <= max * 2 ? [...clean].length : max + 1;
  if (length < min || length > max) invalid(field, `Enter ${min}–${max.toLocaleString("en-US")} characters.`);
  if (/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\uD800-\uDFFF]/u.test(clean)) invalid(field, "This text contains an unsupported character.");
  if (field === "contact" && /[\t\n\u2028\u2029]/.test(clean)) invalid(field, "Enter one contact method on a single line.");
  return clean;
}

/** A proposed calendar day, not a timestamp or a deadline. */
function calendarDate(value: unknown) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith("0000")) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value) return value;
  }
  return invalid("startDate", "Choose a valid proposed start date.");
}

export function parseKickoffInput(value: unknown): KickoffInput {
  const body = object(value, ["note", "contact", "startDate"]);
  return { note: text(body.note, "note"), contact: text(body.contact, "contact"), startDate: calendarDate(body.startDate) };
}

export function assertKickoffAcknowledgement(value: unknown): void {
  if (object(value, ["action"]).action !== "acknowledge") invalid("action", "Choose the acknowledge action.");
}
