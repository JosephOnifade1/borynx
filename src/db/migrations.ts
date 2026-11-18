import path from "node:path";
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool, PoolClient } from "pg";

export const MIGRATIONS_SCHEMA = "drizzle";
export const MIGRATIONS_TABLE = "__drizzle_migrations";
export const LEDGER = `"${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`;
const MIGRATION_LOCK = 4_242_001;

export const migrationsFolder = (): string => path.join(process.cwd(), "drizzle");
type AppliedMigration = { hash: string; created_at: string | null };

async function readLedger(client: PoolClient): Promise<AppliedMigration[]> {
  const { rows: [ledger] } = await client.query<{ present: boolean }>("select to_regclass($1) is not null as present", [LEDGER]);
  if (!ledger.present) return [];
  const { rows } = await client.query<AppliedMigration>(`select hash, created_at::text from ${LEDGER} order by id`);
  return rows;
}

function assertLedgerPrefix(applied: AppliedMigration[], available: MigrationMeta[]) {
  if (applied.some((row, index) => row.hash !== available[index]?.hash || row.created_at !== String(available[index]?.folderMillis))) {
    throw new Error("Drizzle migration history does not match this checkout. Verify the database and reconcile the ledger against a backup before running migrations.");
  }
}

async function assertNoUntrackedSchema(client: PoolClient) {
  const { rows: [row] } = await client.query<{ present: boolean }>(`
    select exists (
      select 1 from pg_class c join pg_namespace n on c.relnamespace = n.oid
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
    ) or exists (
      select 1 from pg_type t join pg_namespace n on t.typnamespace = n.oid
      where n.nspname = 'public' and t.typtype = 'e'
    ) as present
  `);
  if (row.present) {
    throw new Error("Untracked schema in public. Borynx will not guess which migrations ran. Use an empty dedicated database or reconcile the existing schema and ledger on a backup first.");
  }
}

/** Only migrate a fresh schema or a database with a verified prefix of this journal. */
export async function migrateDatabase(pool: Pool, folder = migrationsFolder()) {
  const files = readMigrationFiles({ migrationsFolder: folder });
  if (files.length === 0) throw new Error("No Drizzle migrations found.");
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1::bigint)", [MIGRATION_LOCK]);
    const before = await readLedger(client);
    assertLedgerPrefix(before, files);
    if (before.length === 0) await assertNoUntrackedSchema(client);
    if (before.length === files.length) return { applied: before.length, available: files.length };

    await migrate(drizzle(client), { migrationsFolder: folder, migrationsSchema: MIGRATIONS_SCHEMA, migrationsTable: MIGRATIONS_TABLE });
    const after = await readLedger(client);
    assertLedgerPrefix(after, files);
    if (after.length !== files.length) throw new Error("Drizzle did not apply every pending migration.");
    return { applied: after.length, available: files.length };
  } finally {
    await client.query("select pg_advisory_unlock($1::bigint)", [MIGRATION_LOCK]).catch(() => undefined);
    client.release();
  }
}
