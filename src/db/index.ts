import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { assertDemoDatabase } from "@/lib/demo-mode";
import * as schema from "./schema";

const FALLBACK_URL = "postgresql://postgres:postgres@127.0.0.1:5432/app_db";

assertDemoDatabase();

const databaseUrl = process.env.DATABASE_URL ?? FALLBACK_URL;

if (!process.env.DATABASE_URL) {
  console.warn("[borynx] DATABASE_URL is not set — falling back to the local default connection string");
}

const globalForDb = globalThis as unknown as {
  __arenaNextJsPostgresqlPool?: Pool;
};

function createPool(): Pool {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    // Fail fast instead of hanging a request forever when Postgres is unreachable.
    connectionTimeoutMillis: 5_000,
  });
  // An error on an idle client (e.g. Postgres restarted) must never crash the server process.
  pool.on("error", (err) => console.error("[borynx] idle postgres client error:", err.message));
  return pool;
}

/**
 * One pool per process. Cached on globalThis in every environment so the instrumentation hook,
 * route handlers, and server components — which may be bundled separately — share it.
 */
export const pool = globalForDb.__arenaNextJsPostgresqlPool ?? createPool();
globalForDb.__arenaNextJsPostgresqlPool = pool;

export const db = drizzle(pool, { schema });
export type Database = typeof db;
