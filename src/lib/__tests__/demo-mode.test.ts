import { describe, expect, it } from "vitest";
import { assertDemoDatabase, demoAccountMode, isDemoDatabaseUrl, isDemoMode } from "../demo-mode";
import { isDemoAccountAllowed, normalizeDemoHandle } from "../demo-personas";

const local = "postgresql://test:test@127.0.0.1:55432/borynx_demo";
const development = { NODE_ENV: "development", BORYNX_DEMO_MODE: "1", DATABASE_URL: local };

describe("demo isolation", () => {
  it("keeps the persona mode opt-in and limits it to a dedicated database", () => {
    expect(isDemoMode(development)).toBe(true);
    expect(isDemoMode({ ...development, NODE_ENV: "test" })).toBe(true);
    expect(isDemoMode({ ...development, BORYNX_DEMO_MODE: undefined })).toBe(false);
    expect(isDemoMode({ ...development, NODE_ENV: "production" })).toBe(false);
    expect(isDemoMode({ ...development, DATABASE_URL: undefined })).toBe(false);
    expect(() => assertDemoDatabase({ ...development, DATABASE_URL: undefined })).toThrow(/explicit loopback/);
  });

  it.each([
    "postgresql://test@shared.example/borynx_demo",
    "postgresql://test@127.0.0.1:5432/postgres",
    "postgresql://test@127.0.0.1:5432/borynx_demo?host=shared.example",
    "postgresql://test@127.0.0.1:5432/borynx_demo?dbname=app_db",
    "postgresql://test@/borynx_demo?host=/var/run/postgresql",
    "https://127.0.0.1/borynx_demo",
    "not a URI",
  ])("rejects an unsafe demo database: %s", (database) => {
    expect(isDemoDatabaseUrl(database)).toBe(false);
    expect(isDemoMode({ ...development, DATABASE_URL: database })).toBe(false);
    expect(() => assertDemoDatabase({ ...development, DATABASE_URL: database })).toThrow(/explicit loopback/);
  });
});

describe("restored demo accounts", () => {
  const existing = { ...development, BORYNX_DEMO_EXISTING_ACCOUNTS: "1" };
  const browser = new Headers({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "x-forwarded-host": "127.0.0.1:3000", "x-forwarded-for": "127.0.0.1" });

  it("uses one explicit local mode for existing accounts, and otherwise keeps the five-persona preview", () => {
    expect(demoAccountMode(browser, existing)).toBe("existing");
    expect(demoAccountMode(new Headers({ host: "localhost:3000" }), existing)).toBe("existing");
    expect(demoAccountMode(new Headers({ host: "[::1]:3000", "x-forwarded-for": "::1" }), existing)).toBe("existing");
    expect(demoAccountMode(new Headers({ host: "3000-preview.e2b.app" }), development)).toBe("personas");
    expect(demoAccountMode(browser, { ...existing, BORYNX_DEMO_MODE: "0" })).toBe("disabled");
    expect(demoAccountMode(browser, { ...existing, BORYNX_DEMO_MODE: undefined })).toBe("disabled");
    expect(demoAccountMode(browser, { ...existing, NODE_ENV: "production" })).toBe("disabled");
    expect(demoAccountMode(browser, { ...existing, DATABASE_URL: "postgresql://db.example/borynx_demo" })).toBe("disabled");
  });

  it.each([
    { host: "3000-preview.e2b.app" },
    { host: "localhost.example.invalid:3000" },
    { host: "127.0.0.1:3000", "x-forwarded-host": "3000-preview.e2b.app" },
    { host: "127.0.0.1:3000", "x-forwarded-for": "198.51.100.10, 127.0.0.1" },
    { host: "127.0.0.1:3000", forwarded: "host=3000-preview.e2b.app" },
    { host: "127.0.0.1:3000", origin: "http://localhost:3000" },
    { host: "127.0.0.1:3000", origin: "null" },
  ] as Record<string, string>[])("disables local existing-account sessions for an incompatible request: %o", (headers) => {
    expect(demoAccountMode(new Headers(headers), existing)).toBe("disabled");
  });

  it("normalizes canonical legacy handles and applies the same allowlist to issuance and restoration", () => {
    expect(normalizeDemoHandle("  F/PRIYA.BUILDS  ")).toBe("priya.builds");
    expect(normalizeDemoHandle("u/mara_k")).toBe("mara_k");
    expect(normalizeDemoHandle("demo-bidder-a")).toBe("demo-bidder-a");
    expect(isDemoAccountAllowed("existing", "priya.builds")).toBe(true);
    expect(isDemoAccountAllowed("personas", "priya.builds")).toBe(false);
    expect(isDemoAccountAllowed("disabled", "demo-buyer")).toBe(false);
    expect(isDemoAccountAllowed("personas", "demo-buyer")).toBe(true);
  });

  it.each([null, 123, "f/", "a", "a".repeat(33), "someone/name", "name\0"])("rejects an invalid handle: %j", (value) => {
    expect(normalizeDemoHandle(value)).toBeNull();
  });
});
