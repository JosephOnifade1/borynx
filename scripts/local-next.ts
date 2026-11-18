import { execFile, spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { DemoAccountMode } from "../src/lib/demo-mode";

export function startLocalNext(databaseUrl: string, demo: DemoAccountMode, args: string[], inheritLogs = false, overrides: Readonly<Record<string, string>> = {}) {
  const env = { ...process.env };
  // Do not inherit alternate connection settings (including SSL/options) from a user shell.
  for (const key of Object.keys(env)) if (key.startsWith("PG")) delete env[key];
  return startLocalProcess([join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "dev", ...args], {
    ...env,
    DATABASE_URL: databaseUrl,
    BORYNX_DEMO_MODE: demo === "disabled" ? "0" : "1",
    BORYNX_DEMO_EXISTING_ACCOUNTS: demo === "existing" ? "1" : "0",
    BORYNX_EMAIL_AUTH: "0",
    BORYNX_EMAIL_SENDS: "0",
    ...overrides,
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
  }, inheritLogs);
}

export function startLocalProcess(args: string[], env: NodeJS.ProcessEnv, inheritLogs = false, stopTree = false) {
  // npm launches the script as a grandchild. Give it a process group so tests can stop the app too.
  const detached = stopTree && process.platform !== "win32";
  const child = spawn(process.execPath, args, { env, detached, stdio: inheritLogs ? "inherit" : ["ignore", "pipe", "pipe"] });
  let logs = "";
  for (const stream of [child.stdout, child.stderr]) stream?.on("data", (data) => { logs = (logs + String(data)).slice(-16_000); });
  const exited = new Promise<number | null>((resolve) => {
    child.once("close", resolve);
    child.once("error", (error) => { logs += String(error); resolve(1); });
  });
  const kill = async (signal: NodeJS.Signals) => {
    if (!stopTree || !child.pid) {
      child.kill(signal);
    } else if (detached) {
      try { process.kill(-child.pid, signal); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    } else {
      await new Promise<void>((resolve) => execFile("taskkill", ["/pid", String(child.pid), "/t", "/f"], (error) => {
        if (error) child.kill(signal);
        resolve();
      }));
    }
  };
  const stop = async () => {
    await kill("SIGTERM");
    const forced = Symbol("force stop");
    if (await Promise.race([exited, delay(5_000, forced, { ref: false })]) === forced) {
      await kill("SIGKILL");
      await exited;
    }
  };
  return { child, exited, stop, get logs() { return logs; } };
}
