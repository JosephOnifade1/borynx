import { handler } from "./api";
import { emailAuthConfig } from "./email-auth/policy";
import { HttpError } from "./errors";

/** Same-origin writes in all supported modes, and never log submitted draft content. */
export const portfolioHandler: typeof handler = (fn) => handler(async (req, ctx) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    const protocol = req.headers.get("x-forwarded-proto") === "https" ? "https:" : new URL(req.url).protocol;
    const expected = emailAuthConfig()?.origin ?? `${protocol}//${req.headers.get("host")}`;
    if (req.headers.get("origin") !== expected) throw new HttpError(403, "This action must come from Borynx", "invalid_origin");
  }
  try {
    return await fn(req, ctx);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error("[borynx] Portfolio request failed");
    throw new HttpError(500, "Projects are temporarily unavailable", "project_unavailable");
  }
});

export const PRIVATE_PROJECT_HEADERS = { "Cache-Control": "private, no-store" } as const;

export function projectJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: PRIVATE_PROJECT_HEADERS });
}

/** Preflight Content-Length, but also bound actual bytes for a chunked upload. */
export async function readPortfolioBody(req: Request, type: string, maxBytes: number): Promise<Buffer> {
  if (req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== type) {
    throw new HttpError(415, `Use ${type} for this request.`, "invalid_content_type");
  }
  const tooLarge = () => new HttpError(413, "Request is too large", "body_too_large");
  if (Number(req.headers.get("content-length")) > maxBytes) throw tooLarge();
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Request body is missing", "bad_request");
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 30_000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (timedOut) throw new HttpError(408, "The request took too long", "request_timeout");
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        void reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Could not read request body", "bad_request");
  } finally {
    clearTimeout(deadline);
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export async function readProjectJson(req: Request): Promise<unknown> {
  const bytes = await readPortfolioBody(req, "application/json", 16 * 1024);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, "Invalid JSON body", "bad_request");
  }
}

export async function readCoverForm(req: Request, maxFileBytes: number) {
  const bytes = await readPortfolioBody(req, "multipart/form-data", maxFileBytes + 16 * 1024);
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(bytes), { headers: { "Content-Type": req.headers.get("content-type")! } }).formData();
  } catch {
    throw new HttpError(400, "Invalid cover upload", "bad_request");
  }
  const files = form.getAll("file");
  if (files.length !== 1 || !(files[0] instanceof File) || files[0].size === 0 || form.getAll("altText").length > 1 ||
    [...form.keys()].some((key) => key !== "file" && key !== "altText")) {
    throw new HttpError(422, "Choose one cover image and an optional description.", "invalid_cover", { file: "Choose one cover image." });
  }
  if (files[0].size > maxFileBytes) throw new HttpError(413, "Choose a cover no larger than 3 MiB.", "body_too_large");
  return { file: files[0], altText: form.get("altText") };
}
