import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { join } from "node:path";
import { text } from "node:stream/consumers";
import { LOOPBACK } from "./local-postgres";

export const TEST_PUBLISHABLE_KEY = "sb_publishable_disposable_test_only";

export function testCertificate(directory: string) {
  const cert = join(directory, "test-cert.pem");
  const key = join(directory, "test-key.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost", "-addext", `subjectAltName=DNS:localhost,IP:${LOOPBACK}`, "-keyout", key, "-out", cert], { stdio: "pipe" });
  return { cert, options: { key: readFileSync(key), cert: readFileSync(cert) } };
}

type Delivery = { email: string; code: string; redirect: string; challenge: string; expiresAt: number; used: boolean };
type Account = { id: string; email: string; email_confirmed_at: string | null; is_anonymous: boolean };

/** Test double only. Speaks the three Supabase Auth HTTPS endpoints without sending email. */
export async function fakeSupabaseAuth(tls: ReturnType<typeof testCertificate>["options"], redirectTo: string) {
  const deliveries: Delivery[] = [];
  const accounts = new Map<string, Account>();
  const tokens = new Map<string, Account>();
  const failed = new Set<string>();
  const denied = new Set<string>();
  const attempts: string[] = [];
  const errors: unknown[] = [];
  let exchanges = 0;
  let lookups = 0;
  const server = createServer(tls, async (req, res) => {
    function reply(status: number, body: object) {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(body));
    }
    try {
      const url = new URL(req.url ?? "/", "https://localhost");
      assert.equal(req.headers.apikey, TEST_PUBLISHABLE_KEY);
      assert.equal(req.headers["x-supabase-api-version"], "2024-01-01");
      if (req.method === "POST" && url.pathname === "/auth/v1/otp") {
        const body = JSON.parse(await text(req));
        const { email, code_challenge: challenge } = body;
        assert.deepEqual(Object.keys(body).sort(), ["code_challenge", "code_challenge_method", "create_user", "email"]);
        assert.equal(body.create_user, true);
        assert.equal(body.code_challenge_method, "s256");
        assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
        assert.equal(url.searchParams.get("redirect_to"), redirectTo);
        attempts.push(email);
        if (failed.has(email)) return reply(502, { msg: "synthetic sender failure" });
        if (denied.has(email)) return reply(422, { msg: "synthetic recipient-specific denial" });
        if (!accounts.has(email)) accounts.set(email, { id: randomUUID(), email, email_confirmed_at: new Date().toISOString(), is_anonymous: false });
        for (const previous of deliveries) if (previous.email === email) previous.expiresAt = 0;
        const code = randomUUID();
        deliveries.push({ email, code, redirect: `${redirectTo}?code=${code}`, challenge, expiresAt: Date.now() + 900_000, used: false });
        return reply(200, {});
      }
      if (req.method === "POST" && url.pathname === "/auth/v1/token") {
        assert.equal(url.searchParams.get("grant_type"), "pkce");
        const { auth_code, code_verifier } = JSON.parse(await text(req));
        const event = deliveries.find((mail) => mail.code === auth_code);
        exchanges++;
        if (!event || event.used || event.expiresAt <= Date.now() || createHash("sha256").update(code_verifier).digest("base64url") !== event.challenge) return reply(400, { msg: "Code has expired, is invalid or was used" });
        const user = accounts.get(event.email)!;
        event.used = true;
        const access_token = `synthetic-access-${randomUUID()}`;
        tokens.set(access_token, user);
        return reply(200, { access_token, refresh_token: "synthetic-refresh-never-exposed", user });
      }
      if (req.method === "GET" && url.pathname === "/auth/v1/user") {
        lookups++;
        const user = tokens.get(req.headers.authorization?.replace(/^Bearer /, "") ?? "");
        return user ? reply(200, user) : reply(401, { msg: "No verified session" });
      }
      throw new Error(`Unknown test provider route: ${req.method} ${url.pathname}`);
    } catch (error) {
      errors.push(error);
      reply(500, { msg: "Invalid test request" });
    }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject).listen(0, LOOPBACK, resolve); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    origin: `https://${LOOPBACK}:${address.port}`,
    deliveries, accounts, attempts, failed, denied, errors,
    get exchanges() { return exchanges; },
    get lookups() { return lookups; },
    latest(email: string) {
      const found = deliveries.findLast((delivery) => delivery.email === email);
      assert.ok(found, "expected a fake inbox delivery");
      return found;
    },
    stop: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
