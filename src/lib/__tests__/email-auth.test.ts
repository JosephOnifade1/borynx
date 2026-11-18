import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { readEmailFlow, recipientHash, signEmailFlow } from "../email-auth/flow";
import { normalizedEmail, readEmailJson } from "../email-auth/input";
import { emailAuthConfig, emailCookie, EMAIL_SESSION_COOKIE, trustedClientIp } from "../email-auth/policy";
import { isDemoMode } from "../demo-mode";
import { safeDestination } from "../safe-destination";

const environment = {
  BORYNX_EMAIL_AUTH: "staging",
  DATABASE_URL: "postgresql://localhost/borynx_stage",
  BORYNX_AUTH_ORIGIN: "https://borynx.example.test",
  BORYNX_SUPABASE_URL: "https://supabase.example.test",
  BORYNX_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fake_test_key",
  BORYNX_EMAIL_AUTH_SECRET: randomBytes(32).toString("base64url"),
};

const config = emailAuthConfig(environment)!;

describe("email staging policy", () => {
  it.each([
    { BORYNX_EMAIL_AUTH: "1" }, { BORYNX_DEMO_MODE: "1" }, { DATABASE_URL: "" },
    { BORYNX_AUTH_ORIGIN: "http://borynx.example.test" }, { BORYNX_AUTH_ORIGIN: "https://borynx.example.test/extra" },
    { BORYNX_SUPABASE_URL: "https://name:pass@supabase.example.test" },
    { BORYNX_SUPABASE_PUBLISHABLE_KEY: "sb_secret_fake_key" }, { BORYNX_EMAIL_AUTH_SECRET: "abc" },
  ])("fails closed on %j", (overrides) => {
    expect(emailAuthConfig({ ...environment, ...overrides })).toBeNull();
  });
  it("keeps sends off independently and never treats staging as demo", () => {
    expect(config.canSend).toBe(false);
    expect(emailAuthConfig({ ...environment, BORYNX_EMAIL_SENDS: "1" })?.canSend).toBe(true);
    expect(isDemoMode({ ...environment, NODE_ENV: "development", BORYNX_DEMO_MODE: "1", DATABASE_URL: "postgresql://localhost/borynx_demo" })).toBe(false);
    expect(emailCookie(EMAIL_SESSION_COOKIE, "test", 60)).toBe("__Host-bx_auth=test; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=Lax");
  });
  it("requires a single trusted IP and normalizes equivalent spellings", () => {
    for (const [source, expected] of [["203.0.113.1", "203.0.113.1"], ["::ffff:203.0.113.1", "203.0.113.1"], ["2001:0db8:0000::1", "2001:db8::1"]]) {
      expect(trustedClientIp(new Headers({ "x-borynx-client-ip": source }))).toBe(expected);
    }
    expect(() => trustedClientIp(new Headers({ "x-forwarded-for": "203.0.113.1" }))).toThrow();
    expect(() => trustedClientIp(new Headers({ "x-borynx-client-ip": "203.0.113.1, 203.0.113.2" }))).toThrow();
  });
});

describe("verification intent", () => {
  it("signs a short-lived verifier and binds it to the exact recipient, intake and origin", () => {
    const id = randomUUID();
    const flow = {
      emailHash: recipientHash(config, "buyer@example.test"), intakeId: id, next: "/", expiresAt: Date.now() + 5000,
      verifier: randomBytes(32).toString("base64url"),
    };
    const cookie = signEmailFlow(config, flow);
    expect(readEmailFlow(config, cookie)).toEqual(flow);
    expect(cookie).not.toContain("buyer@example.test");
    const tampered = `${Buffer.from(JSON.stringify({ ...flow, intakeId: randomUUID() })).toString("base64url")}.${cookie.split(".")[1]}`;
    expect(readEmailFlow(config, tampered)).toBeNull();
    expect(readEmailFlow({ ...config, origin: "https://other.example.test" }, cookie)).toBeNull();
    const clock = vi.spyOn(Date, "now").mockReturnValue(flow.expiresAt);
    try { expect(readEmailFlow(config, cookie)).toBeNull(); } finally { clock.mockRestore(); }
  });
  it.each(["//outside.test", "/\\outside.test", "/%2Foutside.test", "/%5coutside.test", "/api/auth/callback", "/../api/login", "/login?next=/l", "javascript:alert(1)", null])("does not redirect to %j", (path) => {
    expect(safeDestination(path)).toBe("/");
  });
  it("preserves a valid app page, query and anchor", () => {
    expect(safeDestination("/l/new?from=board#brief")).toBe("/l/new?from=board#brief");
  });
});

describe("contact and request validation", () => {
  it("normalizes casing without collapsing aliases or accepting addresses with headers", () => {
    expect(normalizedEmail("  Buyer+Stage@EXAMPLE.test  ")).toBe("buyer+stage@example.test");
    for (const invalid of ["broken", "buyer...name@example.test", "buyer@localhost", "a@-example.test", "name\r\n@example.test", "buyer@example.test,second@example.test", `a${"a".repeat(64)}@example.test`]) expect(normalizedEmail(invalid)).toBeNull();
  });
  it("rejects wrong types, malformed bodies and oversized streaming requests", async () => {
    const json = (body: BodyInit) => new Request("https://borynx.example.test", { method: "POST", body, headers: { "Content-Type": "application/json" } });
    await expect(readEmailJson(json("{}"))).resolves.toEqual({});
    await expect(readEmailJson(json("null"))).rejects.toMatchObject({ status: 400 });
    await expect(readEmailJson(json("{"))).rejects.toMatchObject({ status: 400 });
    await expect(readEmailJson(json("{   }"), 4)).rejects.toMatchObject({ status: 413 });
    await expect(readEmailJson(new Request("https://borynx.example.test", { method: "POST", body: "{}" }))).rejects.toMatchObject({ status: 415 });
  });
});
