type Environment = Readonly<Record<string, string | undefined>>;

export function isDemoDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "postgresql:" || url.protocol === "postgres:")
      && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      && /^\/borynx_demo(?:_[a-z0-9]+)*$/.test(url.pathname)
      // Connection options can override the host or database parsed from the URL.
      && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function demoRequested(env: Environment): boolean {
  return env.BORYNX_DEMO_MODE === "1" && (env.NODE_ENV === "development" || env.NODE_ENV === "test");
}

/** One server-side switch for demo seeding, sign-in, and preview transports. */
export function isDemoMode(env: Environment = process.env): boolean {
  return demoRequested(env) && isDemoDatabaseUrl(env.DATABASE_URL);
}

export function assertDemoDatabase(env: Environment = process.env): void {
  if (demoRequested(env) && !isDemoDatabaseUrl(env.DATABASE_URL)) {
    throw new Error("BORYNX_DEMO_MODE=1 requires an explicit loopback DATABASE_URL for borynx_demo or borynx_demo_<suffix>, without URL options. Do not use a shared database.");
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
