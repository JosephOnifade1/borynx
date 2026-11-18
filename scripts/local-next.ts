import { spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { DemoAccountMode } from "../src/lib/demo-mode";

export function startLocalNext(databaseUrl: string, demo: DemoAccountMode, args: string[], inheritLogs = false) {
  const env = { ...process.env };
  // Do not inherit alternate connection settings (including SSL/options) from a user shell.
  for (const key of Object.keys(env)) if (key.startsWith("PG")) delete env[key];
  const child = spawn(process.execPath, [join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "dev", ...args], {
    env: {
      ...env,
      DATABASE_URL: databaseUrl,
      BORYNX_DEMO_MODE: demo === "disabled" ? "0" : "1",
      BORYNX_DEMO_EXISTING_ACCOUNTS: demo === "existing" ? "1" : "0",
      NODE_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: inheritLogs ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  for (const stream of [child.stdout, child.stderr]) stream?.on("data", (data) => { logs = (logs + String(data)).slice(-16_000); });
  const exited = new Promise<number | null>((resolve) => {
    child.once("close", resolve);
    child.once("error", (error) => { logs += String(error); resolve(1); });
  });
  const stop = async () => {
    child.kill("SIGTERM");
    const forced = Symbol("force stop");
    if (await Promise.race([exited, delay(5_000, forced, { ref: false })]) === forced) {
      child.kill("SIGKILL");
      await exited;
    }
  };
  return { child, exited, stop, get logs() { return logs; } };
}
