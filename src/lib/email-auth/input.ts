import { HttpError } from "../errors";
import { leadBody, parseLeadFields, parseSubmissionKey } from "../lead-input";

/** Match the provider's case-insensitive email handling without coalescing plus aliases. */
export function normalizedEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length > 254) return null;
  const [local, domain, extra] = email.split("@");
  if (extra !== undefined || !local || !domain || local.length > 64 ||
    !/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label))) return null;
  return email;
}

export function parseEmail(input: unknown): string {
  const email = normalizedEmail(input);
  if (!email) throw new HttpError(422, "Enter a valid email address", "invalid_email", { email: "Enter a valid email address." });
  return email;
}

function contactText(value: unknown, field: string, min: number, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min || text.length > max || (value != null && typeof value !== "string") || /[\uD800-\uDFFF]/u.test(text) || [...text].some((char) => char.charCodeAt(0) < 32)) {
    const message = field === "displayName" ? "Enter a name of 2–80 characters." : "Enter a company name of at most 100 characters.";
    throw new HttpError(422, message, "invalid_contact", { [field]: message });
  }
  return text;
}

export function parseLeadIntake(body: Record<string, unknown>) {
  const email = parseEmail(body.email);
  const displayName = contactText(body.displayName, "displayName", 2, 80);
  const companyName = contactText(body.companyName, "companyName", 0, 100) || null;
  const lead = leadBody(body.lead);
  return { email, displayName, companyName, submissionKey: parseSubmissionKey(lead.submissionKey), brief: parseLeadFields(lead) };
}

/** Bound bytes even for a chunked upload; keep body/parse failures out of error logs. */
export async function readEmailJson(req: Request, maxBytes = 2048): Promise<Record<string, unknown>> {
  if (req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new HttpError(415, "Send an application/json request", "invalid_content_type");
  }
  const tooLarge = () => new HttpError(413, "Request is too large", "body_too_large");
  if (Number(req.headers.get("content-length")) > maxBytes) throw tooLarge();
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Invalid JSON body", "bad_request");
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let text = "";
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    const body: unknown = JSON.parse(text + decoder.decode());
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
  } finally {
    reader.releaseLock();
  }
  throw new HttpError(400, "Invalid JSON body", "bad_request");
}
