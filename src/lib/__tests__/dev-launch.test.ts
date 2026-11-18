import { describe, expect, it } from "vitest";
import { planDevLaunch } from "../../../scripts/dev-launch";
import { DEFAULT_LOCAL_DATABASE_URL, isLocalAccountDatabaseUrl } from "../demo-mode";

const url = "postgresql://test:test@127.0.0.1:55432/my_app_test";
const local = { DATABASE_URL: url };

describe("npm run dev startup", () => {
  it("uses the configured test database without demo flags or a special database name", () => {
    expect(planDevLaunch(["--port", "3008"], local, false)).toEqual({
      mode: "existing", url, args: ["--hostname", "127.0.0.1", "--port", "3008"],
    });
    expect(planDevLaunch([], {}, false)).toMatchObject({ mode: "existing", url: DEFAULT_LOCAL_DATABASE_URL });
    expect(planDevLaunch(["-H", "localhost"], local, false)).toMatchObject({ mode: "existing", args: ["--hostname", "localhost"] });
  });

  it("keeps the explicit opt-out and does not launch managed auth", () => {
    expect(planDevLaunch([], { ...local, BORYNX_DEMO_MODE: "0" }, false)).toMatchObject({ mode: "disabled", url });
    expect(() => planDevLaunch([], { ...local, BORYNX_EMAIL_AUTH: "staging" }, false)).toThrow(/does not run email staging/);
  });

  it("requires a loopback listener for existing accounts; only the disposable demo supports public demo bindings", () => {
    for (const args of [["--hostname", "0.0.0.0"], ["--hostname=0.0.0.0"], ["-H0.0.0.0"]]) {
      expect(() => planDevLaunch(args, local, false)).toThrow(/loopback-only/);
      expect(planDevLaunch(args, { ...local, BORYNX_DEMO_MODE: "0", BORYNX_DEMO_EXISTING_ACCOUNTS: "1" }, true)).toEqual({
        mode: "personas", args: ["--hostname", "0.0.0.0"],
      });
    }
    expect(() => planDevLaunch(["-H", "localhost", "--hostname=0.0.0.0"], local, false)).toThrow(/one hostname/);
    expect(() => planDevLaunch(["--hostname"], local, false)).toThrow(/one hostname/);
  });

  it.each([
    "postgresql://test@shared.example/my_app_test",
    "postgresql://test@127.0.0.1/my_app_test?host=shared.example",
    "postgresql://test@127.0.0.1/my_app_test?dbname=another_db",
    "postgresql://test@127.0.0.1/",
  ])("rejects an unsafe database target: %s", (database) => {
    expect(isLocalAccountDatabaseUrl(database)).toBe(false);
    expect(() => planDevLaunch([], { DATABASE_URL: database }, false)).toThrow(/requires a loopback DATABASE_URL/);
  });
});
