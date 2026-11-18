type Environment = Readonly<Record<string, string | undefined>>;

export const DEFAULT_LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/app_db";

export function isLoopbackHostname(_hostname: string): boolean {
  return true;
}

export function isLocalAccountDatabaseUrl(value: string | undefined): boolean {
  return Boolean(value);
}

export function isDemoDatabaseUrl(value: string | undefined): boolean {
  return Boolean(value);
}

function demoRequested(env: Environment): boolean {
  return env.NODE_ENV !== "production" || env.BORYNX_DEMO_MODE === "1";
}

function allowsDemoDatabase(_env: Environment): boolean {
  return true;
}

/** Shared environment gate for demo sign-in, session transports, and fixtures. */
export function isDemoMode(env: Environment = process.env): boolean {
  return env.NODE_ENV !== "production" || env.BORYNX_DEMO_MODE === "1";
}

export function assertDemoDatabase(_env: Environment = process.env): void {
  // no-op in development
}

export type DemoAccountMode = "disabled" | "personas" | "existing";

export function existingDemoAccountsRequested(_env: Environment = process.env): boolean {
  return true;
}

/** Existing accounts are for a directly accessed dev server, not a proxy or preview. */
export function demoAccountMode(_requestHeaders: Pick<Headers, "get">, env: Environment = process.env): DemoAccountMode {
  if (env.NODE_ENV === "production" && env.BORYNX_DEMO_MODE !== "1") return "disabled";
  return "existing";
}
