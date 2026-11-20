import { DEFAULT_LOCAL_DATABASE_URL, existingDemoAccountsRequested, isLocalAccountDatabaseUrl, isLoopbackHostname } from "../src/lib/demo-mode";
import { LOOPBACK } from "./local-postgres";

type DevLaunch = { args: string[] } & ({ mode: "personas" } | { mode: "existing" | "disabled"; url: string });

/** Normalize every Next host option before deciding whether existing accounts can be opened. */
export function planDevLaunch(args: string[], env: Readonly<Record<string, string | undefined>>, disposable: boolean): DevLaunch {
  let hostname: string | undefined;
  const nextArgs: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--") {
      nextArgs.push(...args.slice(index));
      break;
    }
    let value: string | undefined;
    if (arg === "--hostname" || arg === "-H") value = args[++index];
    else if (arg.startsWith("--hostname=")) value = arg.slice(11);
    else if (arg.startsWith("-H")) value = arg.slice(2).replace(/^=/, "");
    else {
      nextArgs.push(arg);
      continue;
    }
    if (hostname !== undefined || !value || value.startsWith("-")) throw new Error("Pass one hostname using --hostname <host>.");
    hostname = value === "[::1]" ? "::1" : value;
  }
  hostname ??= LOOPBACK;
  const launchArgs = ["--hostname", hostname, ...nextArgs];
  if (disposable) return { mode: "personas", args: launchArgs };
  if (env.BORYNX_EMAIL_AUTH === "staging") {
    throw new Error("npm run dev does not run email staging. Turn off BORYNX_EMAIL_AUTH for local development, or use npm run dev:demo for a disposable demo.");
  }
  const url = env.DATABASE_URL || DEFAULT_LOCAL_DATABASE_URL;
  if (env.BORYNX_DEMO_MODE === "0") return { mode: "disabled", url, args: launchArgs };
  if (!isLoopbackHostname(hostname)) {
    throw new Error("Existing demo sign-in is loopback-only. Run npm run dev without a hostname, or use npm run dev:demo for a disposable preview.");
  }
  if (!isLocalAccountDatabaseUrl(url) && !existingDemoAccountsRequested(env)) {
    throw new Error("Existing demo sign-in requires a loopback DATABASE_URL for your local PostgreSQL test database, without URL options. Use npm run dev:demo for a disposable demo, or set BORYNX_DEMO_MODE=0 to disable demo sign-in.");
  }
  return { mode: "existing", url, args: launchArgs };
}
