import { config } from "dotenv";
import { Pool } from "pg";
import { migrateDatabase } from "../src/db/migrations";
import { assertDemoDatabase } from "../src/lib/demo-mode";

async function main() {
  config({ path: [".env.local", ".env"], quiet: true });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Set DATABASE_URL explicitly before applying migrations.");
  assertDemoDatabase({ ...process.env, NODE_ENV: "development" });
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5_000 });
  try {
    const result = await migrateDatabase(pool);
    console.log(`Verified ${result.applied}/${result.available} Drizzle migrations.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
