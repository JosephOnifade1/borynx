/**
 * Next.js calls `register()` once when a server instance starts. We kick off the database
 * bootstrap (migrations + seed) immediately so it is usually finished before the first request.
 * It is fire-and-forget: requests await the same memoised promise via `ensureDatabase()`, so the
 * server never blocks startup on Postgres and never crashes if the database is late.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { ensureDatabase } = await import("./db/bootstrap");
    void ensureDatabase();
  } catch (err) {
    console.error("[borynx] could not start database bootstrap:", err);
  }
}
