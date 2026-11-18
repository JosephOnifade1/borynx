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
