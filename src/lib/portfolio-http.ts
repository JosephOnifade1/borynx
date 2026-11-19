import { assertSameOrigin, handler } from "./api";
import { HttpError } from "./errors";
import { readBodyBytes, readBoundedJson } from "./request-body";

/** Same-origin writes in all supported modes, and never log submitted draft content. */
export const portfolioHandler: typeof handler = (fn) => handler(async (req, ctx) => {
  if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
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

export const readProjectJson = (req: Request) => readBoundedJson(req, 16 * 1024);

export async function readCoverForm(req: Request, maxFileBytes: number) {
  const bytes = await readBodyBytes(req, "multipart/form-data", maxFileBytes + 16 * 1024);
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
