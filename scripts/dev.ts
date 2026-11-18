import { loadEnvConfig } from "@next/env";
import { planDevLaunch } from "./dev-launch";
import { startLocalNext } from "./local-next";
import { withLocalPostgres } from "./local-postgres";
import type { DemoAccountMode } from "../src/lib/demo-mode";

async function serve(url: string, mode: DemoAccountMode, args: string[]) {
  const app = startLocalNext(url, mode, args, true);
  const stop = () => { void app.stop(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const code = await app.exited;
    if (code) process.exitCode = code;
    if (app.logs) console.error(app.logs);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const disposable = args[0] === "--disposable";
  if (disposable) args.shift();
  else {
    // Load the same .env files that Next uses for `next dev`.
    Object.assign(process.env, { NODE_ENV: "development" });
    loadEnvConfig(process.cwd(), true);
  }
  const launch = planDevLaunch(args, process.env, disposable);
  if (launch.mode !== "personas") {
    if (!process.env.DATABASE_URL) console.log("DATABASE_URL is not set; using the local app_db default.");
    console.log(launch.mode === "existing"
      ? "Using your local test database. Open /login to sign in with an existing demo handle."
      : "Demo sign-in is disabled by BORYNX_DEMO_MODE=0.");
    return serve(launch.url, launch.mode, launch.args);
  }
  // Don't let alternate PG settings from the shell change the disposable cluster connection.
  for (const key of Object.keys(process.env)) if (key.startsWith("PG")) delete process.env[key];
  await withLocalPostgres(async ({ createDatabase }) => {
    const url = await createDatabase("borynx_demo");
    console.log("Disposable PostgreSQL ready. Open /login to choose a fictional demo account. Data is cleared on normal shutdown.");
    await serve(url, launch.mode, launch.args);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not start local development.");
  process.exitCode = 1;
});
