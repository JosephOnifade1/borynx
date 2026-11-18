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
  if (env.BORYNX_DEMO_MODE === "0") return false;
  return env.NODE_ENV !== "production" || env.BORYNX_DEMO_MODE === "1";
}

export function assertDemoDatabase(_env: Environment = process.env): void {
  // no-op
}
