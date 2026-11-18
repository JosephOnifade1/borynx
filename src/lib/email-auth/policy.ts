import { isIP } from "node:net";
import { HttpError } from "../errors";

export const EMAIL_SESSION_COOKIE = "__Host-bx_auth";
export const EMAIL_FLOW_COOKIE = "__Host-bx_email_flow";
export const EMAIL_SESSION_TTL = 7 * 24 * 60 * 60;
export const EMAIL_LINK_TTL = 15 * 60;
export const AUTH_CALLBACK_PATH = "/api/auth/callback";
export const INGRESS_IP_HEADER = "x-borynx-client-ip";
export const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

function httpsOrigin(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && value === url.origin ? url : null;
  } catch {
    return null;
  }
}

/** All values are server-only. An incomplete or conflicting configuration fails closed. */
export function emailAuthConfig(env: Readonly<Record<string, string | undefined>> = process.env) {
  if (env.BORYNX_EMAIL_AUTH !== "staging" || env.BORYNX_DEMO_MODE === "1" || !env.DATABASE_URL) return null;
  const app = httpsOrigin(env.BORYNX_AUTH_ORIGIN);
  const supabase = httpsOrigin(env.BORYNX_SUPABASE_URL);
  const key = env.BORYNX_SUPABASE_PUBLISHABLE_KEY;
  const secret = env.BORYNX_EMAIL_AUTH_SECRET;
  // A publishable, not a service-role or secret key. Never ship even this key to the browser.
  if (!app || !supabase || supabase.origin.length > 246 || !key || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) || !secret || !OPAQUE_TOKEN.test(secret)) return null;
  return {
    origin: app.origin,
    host: app.host,
    supabaseUrl: `${supabase.origin}/auth/v1`,
    provider: `supabase:${supabase.origin}`,
    publishableKey: key,
    secret: Buffer.from(secret, "base64url"),
    canSend: env.BORYNX_EMAIL_SENDS === "1",
  };
}

export type EmailAuthConfig = NonNullable<ReturnType<typeof emailAuthConfig>>;

export function isAuthHost(config: EmailAuthConfig, headers: Pick<Headers, "get">): boolean {
  return headers.get("host") === config.host;
}

export function requireEmailAuth(req: Request, { send = false } = {}): EmailAuthConfig {
  const config = emailAuthConfig();
  if (!config || !isAuthHost(config, req.headers)) throw new HttpError(404, "Email sign-in is unavailable", "not_found");
  if (send && !config.canSend) throw new HttpError(503, "New sign-in emails are paused", "email_paused");
  return config;
}

/** Covers every existing API mutation too: Lax cookies alone don't stop a sibling origin. */
export function assertMutationOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const config = emailAuthConfig();
  if (config && (!isAuthHost(config, req.headers) || req.headers.get("origin") !== config.origin)) {
    throw new HttpError(403, "This action must come from Borynx", "invalid_origin");
  }
}

/** The trusted ingress overwrites this one header; do not use arbitrary X-Forwarded-For. */
export function trustedClientIp(headers: Pick<Headers, "get">): string {
  const value = headers.get(INGRESS_IP_HEADER);
  const version = value && !value.includes("%") ? isIP(value) : 0;
  if (value && version === 4) return value;
  if (value && version === 6) {
    const ip = new URL(`http://[${value}]`).hostname.slice(1, -1);
    const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(ip);
    if (!mapped) return ip;
    const [a, b] = mapped.slice(1).map((part) => parseInt(part, 16));
    return [a >> 8, a & 255, b >> 8, b & 255].join(".");
  }
  throw new HttpError(503, "Email requests are temporarily unavailable", "email_unavailable");
}

export function emailCookie(name: string, token: string, maxAge: number): string {
  return `${name}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
