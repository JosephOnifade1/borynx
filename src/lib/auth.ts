import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "@/db";
import { memberships, sessions, users, type User } from "@/db/schema";
import { demoAccountMode, isDemoMode } from "./demo-mode";
import { isDemoAccountAllowed } from "./demo-personas";
import { HttpError } from "./errors";

export { HttpError };

export const SESSION_COOKIE = "bx_session";
/** Fallback transport for embedded previews whose browsers refuse third-party cookies. */
export const SESSION_HEADER = "x-bx-session";
export const REFERRAL_COOKIE = "bx_ref";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The same request policy gates the picker, session issuance, and every token transport. */
export const getDemoAccountMode = cache(async () => isDemoMode() ? demoAccountMode(await headers()) : "disabled" as const);

export type SessionTransport = "cookie" | "header";

/* ------------------------------------------------------------------ */
/* Cookies                                                             */
/* ------------------------------------------------------------------ */

export function isSecureRequest(req: Request): boolean {
  const override = process.env.COOKIE_SECURE;
  if (override === "true") return true;
  if (override === "false") return false;
  const h = req.headers;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto === "https") return true;
  if (h.get("x-forwarded-ssl")?.toLowerCase() === "on") return true;
  if (/proto=https/i.test(h.get("forwarded") ?? "")) return true;
  if (new URL(req.url).protocol === "https:") return true;
  // Public hostnames (preview tunnels, deployments) are TLS-terminated upstream even when the
  // proxy strips forwarding headers. Only loopback / private hosts are treated as plain HTTP.
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(":")[0].toLowerCase();
  if (!host) return false;
  const isLocal =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "[" || // IPv6 loopback "[::1]:3000" splits to "["
    /^(10|127)\.\d+\.\d+\.\d+$/.test(host) ||
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal");
  return !isLocal;
}

/**
 * Over TLS, cookies are `SameSite=None; Secure; Partitioned` (CHIPS) so they survive inside a
 * cross-origin preview iframe. Plain-HTTP localhost keeps `SameSite=Lax`.
 */
export function buildCookie(req: Request, name: string, value: string, maxAgeSeconds: number, httpOnly: boolean = true): string {
  const parts = [`${name}=${value}`, "Path=/", `Max-Age=${maxAgeSeconds}`];
  if (httpOnly) parts.push("HttpOnly");
  if (isSecureRequest(req)) parts.push("SameSite=None", "Secure", "Partitioned");
  else parts.push("SameSite=Lax");
  return parts.join("; ");
}

/* ------------------------------------------------------------------ */
/* Database-backed sessions                                            */
/* ------------------------------------------------------------------ */

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

type SuspensionState = Pick<User, "isBanned" | "banExpiresAt">;

export async function createDemoSession(user: Pick<User, "id" | "username"> & SuspensionState, userAgent: string): Promise<{ token: string; expiresAt: Date }> {
  if (!isDemoAccountAllowed(await getDemoAccountMode(), user.username)) throw new HttpError(404, "Demo account not found", "not_found");
  if (isSuspended(user)) throw new HttpError(403, "Account is suspended or banned", "restricted");
  const token = randomBytes(32).toString("base64url"); // 43 chars, 256 bits
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date())); // housekeeping
  await db.insert(sessions).values({ id: hashToken(token), userId: user.id, userAgent: userAgent.slice(0, 255), expiresAt });
  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export interface ResolvedSession {
  user: User;
  token: string;
  transport: SessionTransport;
}

async function tokenCandidates(): Promise<Array<{ token: string; transport: SessionTransport }>> {
  const [jar, hdrs] = await Promise.all([cookies(), headers()]);
  const out: Array<{ token: string; transport: SessionTransport }> = [];
  const fromCookie = jar.get(SESSION_COOKIE)?.value;
  if (fromCookie && TOKEN_PATTERN.test(fromCookie)) out.push({ token: fromCookie, transport: "cookie" });
  const fromHeader = hdrs.get(SESSION_HEADER) ?? hdrs.get("authorization")?.match(/^Bearer\s+([A-Za-z0-9_-]{43})$/i)?.[1] ?? null;
  if (fromHeader && TOKEN_PATTERN.test(fromHeader) && fromHeader !== fromCookie) out.push({ token: fromHeader, transport: "header" });
  return out;
}

/** Resolves the session from the cookie first, then the header. Memoised per request. */
export const getSession = cache(async (): Promise<ResolvedSession | null> => {
  // These are handle-only demo sessions, not real authentication. All transports use
  // the same account policy as login, even for a session issued before a mode change.
  const mode = await getDemoAccountMode();
  if (mode === "disabled") return null;
  const candidates = (await tokenCandidates()).map((c) => ({ ...c, id: hashToken(c.token) }));
  if (candidates.length === 0) return null;
  const rows = await db
    .select({ user: users, id: sessions.id, lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(inArray(sessions.id, candidates.map((c) => c.id)), gt(sessions.expiresAt, new Date())));
  for (const candidate of candidates) {
    const row = rows.find((r) => r.id === candidate.id);
    if (!row || !isDemoAccountAllowed(mode, row.user.username)) continue;
    if (Date.now() - row.lastSeenAt.getTime() > 3_600_000) {
      void db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.id)).catch(() => undefined);
    }
    return { user: row.user, token: candidate.token, transport: candidate.transport };
  }
  return null;
});

export const getCurrentUser = cache(async (): Promise<User | null> => (await getSession())?.user ?? null);

/* ------------------------------------------------------------------ */
/* Public shape & guards                                               */
/* ------------------------------------------------------------------ */

/** Public user shape — never leak moderation internals to arbitrary clients. */
export type PublicUser = Pick<
  User,
  "id" | "username" | "displayName" | "headline" | "avatarHue" | "skills" | "role" | "isVerified" | "karma" | "githubUrl" | "portfolioUrl" | "createdAt" | "isBanned"
>;

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    headline: u.headline,
    avatarHue: u.avatarHue,
    skills: u.skills,
    role: u.role,
    isVerified: u.isVerified,
    karma: u.karma,
    githubUrl: u.githubUrl,
    portfolioUrl: u.portfolioUrl,
    createdAt: u.createdAt,
    isBanned: u.isBanned,
  };
}

export function isSuspended(user: SuspensionState, now: Date = new Date()): boolean {
  if (!user.isBanned) return false;
  if (user.banExpiresAt && user.banExpiresAt.getTime() < now.getTime()) return false; // suspension lapsed
  return true;
}

export function restrictionMessage(user: User): string {
  if (user.banExpiresAt) return `Account suspended until ${user.banExpiresAt.toLocaleDateString("en-US")}${user.banReason ? ` — ${user.banReason}` : ""}`;
  return `Account permanently banned${user.banReason ? ` — ${user.banReason}` : ""}`;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Sign in to continue", "unauthenticated");
  return user;
}

/** Requires a signed-in user who is allowed to write (post/comment/bid/vote). */
export async function requireActor(): Promise<User> {
  const user = await requireUser();
  if (isSuspended(user)) throw new HttpError(403, restrictionMessage(user), "restricted");
  return user;
}

export function isSiteStaff(user: Pick<User, "role">): boolean {
  return user.role === "admin" || user.role === "moderator";
}

export async function canModerateSpace(user: User, spaceId: number): Promise<boolean> {
  if (isSiteStaff(user)) return true;
  const [m] = await db
    .select({ modRole: memberships.modRole })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.spaceId, spaceId)))
    .limit(1);
  return Boolean(m?.modRole);
}

export async function requireStaff(): Promise<User> {
  const user = await requireActor();
  if (!isSiteStaff(user)) throw new HttpError(403, "Moderator access required", "forbidden");
  return user;
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    const headers = new Headers({ "Cache-Control": "private, no-store" });
    if (err.retryAfter !== undefined) headers.set("Retry-After", String(err.retryAfter));
    return Response.json({ error: err.message, code: err.code, ...(err.fields && { fields: err.fields }) }, { status: err.status, headers });
  }
  console.error(err);
  return Response.json({ error: "Something went wrong", code: "internal" }, { status: 500 });
}
