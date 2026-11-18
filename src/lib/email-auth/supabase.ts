import "server-only";
import { createHash } from "node:crypto";
import { normalizedEmail } from "./input";
import { AUTH_CALLBACK_PATH, UUID, type EmailAuthConfig } from "./policy";

/** The browser never receives the provider key, JWT or refresh token. */
async function authRequest(config: EmailAuthConfig, path: string, body?: object, token?: string) {
  return fetch(`${config.supabaseUrl}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      apikey: config.publishableKey,
      "X-Supabase-Api-Version": "2024-01-01",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
    redirect: "error",
    cache: "no-store",
  });
}

export async function sendSupabaseLink(config: EmailAuthConfig, email: string, verifier: string): Promise<"sent" | "not_sent" | "unavailable"> {
  try {
    const redirect = new URLSearchParams({ redirect_to: `${config.origin}${AUTH_CALLBACK_PATH}` });
    const response = await authRequest(config, `/otp?${redirect}`, {
      email,
      create_user: true,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "s256",
    });
    void response.body?.cancel().catch(() => undefined);
    if (response.ok) return "sent";
    // Do not echo address-specific denials or provider rate information that could identify accounts.
    return response.status >= 500 || response.status === 401 ? "unavailable" : "not_sent";
  } catch {
    return "unavailable";
  }
}

export type VerifiedEmail = { subject: string; email: string; verifiedAt: Date };

/** Exchange the one-use PKCE code, then look up the verified user with the provider itself. */
export async function verifySupabaseCode(config: EmailAuthConfig, code: string, verifier: string): Promise<VerifiedEmail | null> {
  try {
    const exchange = await authRequest(config, "/token?grant_type=pkce", { auth_code: code, code_verifier: verifier });
    if (!exchange.ok) {
      void exchange.body?.cancel().catch(() => undefined);
      return null;
    }
    const session = await exchange.json();
    if (typeof session?.access_token !== "string" || !session.access_token || typeof session.user?.id !== "string" || !UUID.test(session.user.id)) return null;
    const lookup = await authRequest(config, "/user", undefined, session.access_token);
    if (!lookup.ok) {
      void lookup.body?.cancel().catch(() => undefined);
      return null;
    }
    const user = await lookup.json();
    if (!user || user.id !== session.user.id || user.is_anonymous === true || typeof user.email_confirmed_at !== "string") return null;
    const verifiedAt = new Date(user.email_confirmed_at);
    const email = normalizedEmail(user.email);
    if (!email || !Number.isFinite(verifiedAt.getTime()) || verifiedAt.getTime() > Date.now() + 60_000) return null;
    return { subject: user.id.toLowerCase(), email, verifiedAt };
  } catch {
    return null;
  }
}
