import { NextRequest } from "next/server";
import { ensureDatabase } from "@/db/bootstrap";
import { errorResponse, HttpError } from "./auth";
import { assertMutationOrigin, emailAuthConfig } from "./email-auth/policy";

type Params = Record<string, string>;
type Handler = (req: NextRequest, ctx: { params: Params }) => Promise<Response>;

/**
 * Wraps a route handler: waits for the database bootstrap (memoised, instant after boot), maps
 * errors uniformly, and resolves Next 16's async params.
 */
export function handler(fn: Handler) {
  return async (req: NextRequest, ctx: { params: Promise<Params> }): Promise<Response> => {
    try {
      assertMutationOrigin(req);
      const status = await ensureDatabase();
      if (!status.ok) {
        return Response.json(
          { error: "Database unavailable", code: "db_unavailable" },
          { status: 503, headers: { "Retry-After": "5", "Cache-Control": "private, no-store" } },
        );
      }
      const params = await ctx.params;
      return await fn(req, { params });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function privateJson(data: unknown): Response {
  return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
}

/** Require an exact browser origin even in local demo mode for private writes. */
export function assertSameOrigin(req: Request): void {
  const protocol = req.headers.get("x-forwarded-proto") === "https" ? "https:" : new URL(req.url).protocol;
  const host = req.headers.get("host");
  const expected = emailAuthConfig()?.origin ?? (host ? `${protocol}//${host}` : null);
  if (!expected || req.headers.get("origin") !== expected) throw new HttpError(403, "This action must come from Borynx", "invalid_origin");
}

export async function readJson<T extends Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body", "bad_request");
  }
}

export function num(value: string | undefined | null, name: string = "id"): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) throw new HttpError(400, `Invalid ${name}`, "bad_request");
  return n;
}

export function str(value: unknown, name: string, { min = 1, max = 10_000 }: { min?: number; max?: number } = {}): string {
  if (typeof value !== "string") throw new HttpError(400, `${name} is required`, "bad_request");
  const v = value.trim();
  if (v.length < min) throw new HttpError(400, `${name} is too short`, "bad_request");
  if (v.length > max) throw new HttpError(400, `${name} is too long (max ${max})`, "bad_request");
  return v;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw new HttpError(400, `${name} must be one of ${allowed.join(", ")}`, "bad_request");
}
