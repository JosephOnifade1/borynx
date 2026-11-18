type Environment = Readonly<Record<string, string | undefined>>;

export const DEFAULT_LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/app_db";

export function isLoopbackHostname(hostname: string): boolean {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname.toLowerCase());
}

function loopbackDatabaseName(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    // No connection options that could replace the parsed host or database.
    if ((url.protocol === "postgresql:" || url.protocol === "postgres:") && isLoopbackHostname(url.hostname)
      && /^\/[a-z0-9_][a-z0-9_.-]{0,62}$/i.test(url.pathname) && !url.search && !url.hash) return url.pathname.slice(1);
  } catch { /* Not a usable PostgreSQL URL. */ }
  return null;
}

/** Existing test accounts do not require a particular database name. */
export function isLocalAccountDatabaseUrl(value: string | undefined): boolean {
  return loopbackDatabaseName(value) !== null;
}

/** Persona seeding is limited to the dedicated demo database prefix. */
export function isDemoDatabaseUrl(value: string | undefined): boolean {
  return /^borynx_demo(?:_[a-z0-9]+)*$/.test(loopbackDatabaseName(value) ?? "");
}

function demoRequested(env: Environment): boolean {
  return env.BORYNX_DEMO_MODE === "1" && env.BORYNX_EMAIL_AUTH !== "staging" && (env.NODE_ENV === "development" || env.NODE_ENV === "test");
}

function allowsDemoDatabase(env: Environment): boolean {
  return existingDemoAccountsRequested(env) ? isLocalAccountDatabaseUrl(env.DATABASE_URL) : isDemoDatabaseUrl(env.DATABASE_URL);
}

/** Shared environment gate for demo sign-in, session transports, and fixtures. */
export function isDemoMode(env: Environment = process.env): boolean {
  return demoRequested(env) && allowsDemoDatabase(env);
}

export function assertDemoDatabase(env: Environment = process.env): void {
  if (demoRequested(env) && !allowsDemoDatabase(env)) {
    const name = existingDemoAccountsRequested(env) ? "a dedicated local test database" : "borynx_demo or borynx_demo_<suffix>";
    throw new Error(`BORYNX_DEMO_MODE=1 requires an explicit loopback DATABASE_URL for ${name}, without URL options. Do not use a shared database.`);
  }
}

export type DemoAccountMode = "disabled" | "personas" | "existing";
const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;
const LOOPBACK_ADDRESS = /^(?:127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/i;

export function existingDemoAccountsRequested(env: Environment = process.env): boolean {
  return env.BORYNX_DEMO_EXISTING_ACCOUNTS === "1";
}

/** Existing accounts are for a directly accessed, loopback-bound dev server, not a proxy or preview.
 * These request checks are an extra guard, not a substitute for binding the server to loopback.
 */
export function demoAccountMode(requestHeaders: Pick<Headers, "get">, env: Environment = process.env): DemoAccountMode {
  if (!isDemoMode(env)) return "disabled";
  if (!existingDemoAccountsRequested(env)) return "personas";

  const host = requestHeaders.get("host")?.toLowerCase();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  if (!host || !LOOPBACK_HOST.test(host) || requestHeaders.get("forwarded") !== null ||
    (forwardedHost !== null && forwardedHost.toLowerCase() !== host) ||
    (forwardedFor !== null && !forwardedFor.split(",").every((address) => LOOPBACK_ADDRESS.test(address.trim())))) return "disabled";

  const origin = requestHeaders.get("origin");
  const scheme = requestHeaders.get("x-forwarded-proto") === "https" ? "https" : "http";
  return origin === null || origin === `${scheme}://${host}` ? "existing" : "disabled";
}
