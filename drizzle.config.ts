import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { MIGRATIONS_SCHEMA, MIGRATIONS_TABLE } from "./src/db/migrations";

config({ path: [".env.local", ".env"], quiet: true });

/** Generate migrations with Drizzle Kit; apply them with the ledger-checking `npm run db:migrate`. */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  ...(process.env.DATABASE_URL ? { dbCredentials: { url: process.env.DATABASE_URL } } : {}),
  migrations: { table: MIGRATIONS_TABLE, schema: MIGRATIONS_SCHEMA },
  strict: false,
  verbose: false,
});
