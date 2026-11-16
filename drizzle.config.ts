import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Borynx Drizzle Kit configuration.
 *
 *  npx drizzle-kit generate   → diff src/db/schema.ts into ./drizzle/NNNN_*.sql
 *  npx drizzle-kit migrate    → apply pending migrations (same ledger the app uses at boot)
 *  npx drizzle-kit push       → fast-path sync for throwaway sandboxes
 *  npx drizzle-kit studio     → browse data
 *
 * The app also applies these migrations itself on startup (src/db/bootstrap.ts), so a fresh
 * database needs no manual step. The ledger lives in the `drizzle` schema — outside `public` —
 * so `push` never proposes dropping it.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
  strict: false,
  verbose: false,
});
