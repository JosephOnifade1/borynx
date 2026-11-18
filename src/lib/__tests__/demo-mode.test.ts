import { describe, expect, it } from "vitest";
import { assertDemoDatabase, isDemoDatabaseUrl, isDemoMode } from "../demo-mode";

const local = "postgresql://test:test@127.0.0.1:55432/borynx_demo";
const development = { NODE_ENV: "development", BORYNX_DEMO_MODE: "1", DATABASE_URL: local };

describe("demo isolation", () => {
  it("requires an explicit dev or test opt-in and a dedicated database", () => {
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
