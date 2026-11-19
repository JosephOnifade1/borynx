import { HttpError } from "./errors";

/** Preflight Content-Length, but also bound actual bytes for a chunked upload. */
export async function readBodyBytes(req: Request, type: string, maxBytes: number): Promise<Buffer> {
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

export async function readBoundedJson(req: Request, maxBytes: number): Promise<unknown> {
  const bytes = await readBodyBytes(req, "application/json", maxBytes);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, "Invalid JSON body", "bad_request");
  }
}
