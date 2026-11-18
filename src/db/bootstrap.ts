import fs from "node:fs";
import path from "node:path";
import { pool } from "./index";
import { LEDGER, migrateDatabase, migrationsFolder } from "./migrations";
import { seedDatabase, type SeedResult } from "./seed";

/** Connect → verify/apply the Drizzle journal → seed the catalogue and optional demo fixtures. */
const FIRST_CONNECT_BUDGET_MS = 15_000;
const RETRY_CONNECT_BUDGET_MS = 3_000;
const RETRY_COOLDOWN_MS = 4_000;

export type BootstrapStage = "connect" | "migrate" | "seed" | "ready";
export type SeedState = SeedResult | "failed" | "pending";

export interface DbStatus {
  ok: boolean;
  stage: BootstrapStage;
  error: string | null;
  migrationsApplied: number;
  migrationsAvailable: number;
  seed: SeedState;
  seedError: string | null;
  durationMs: number;
  finishedAt: string;
}

const state = globalThis as typeof globalThis & {
  __borynxDbPromise?: Promise<DbStatus>;
  __borynxDbLast?: DbStatus;
};

const describe = (err: unknown): string => (err instanceof Error ? err.message : String(err));

async function waitForPostgres(budgetMs: number): Promise<void> {
  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query("select 1");
      return;
    } catch (err) {
      if (Date.now() - started >= budgetMs) throw new Error(`PostgreSQL unreachable after ${attempt} attempt(s): ${describe(err)}`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(200 * 2 ** attempt, 2_000)));
    }
  }
}

async function bootstrap(connectBudgetMs: number): Promise<DbStatus> {
  const started = Date.now();
  const status: DbStatus = {
    ok: false,
    stage: "connect",
    error: null,
    migrationsApplied: 0,
    migrationsAvailable: 0,
    seed: "pending",
    seedError: null,
    durationMs: 0,
    finishedAt: "",
  };
  try {
    await waitForPostgres(connectBudgetMs);

    status.stage = "migrate";
    const { applied, available } = await migrateDatabase(pool);
    status.migrationsApplied = applied;
    status.migrationsAvailable = available;

    status.stage = "seed";
    try {
      status.seed = await seedDatabase();
    } catch (err) {
      // The seed transaction rolls back both catalogue and demo data on failure.
      status.seed = "failed";
      status.seedError = describe(err);
    }

    status.ok = true;
    status.stage = "ready";
  } catch (err) {
    status.error = describe(err);
  }
  status.durationMs = Date.now() - started;
  status.finishedAt = new Date().toISOString();
  return status;
}

/** Memoised per process. A failed attempt is cached for a short cooldown, then retried. */
export function ensureDatabase(): Promise<DbStatus> {
  if (state.__borynxDbPromise) return state.__borynxDbPromise;
  const last = state.__borynxDbLast;
  if (last && !last.ok && Date.now() - Date.parse(last.finishedAt) < RETRY_COOLDOWN_MS) return Promise.resolve(last);

  const run = bootstrap(last ? RETRY_CONNECT_BUDGET_MS : FIRST_CONNECT_BUDGET_MS).then((status) => {
    state.__borynxDbLast = status;
    if (status.ok) {
      console.log(
        `[borynx] database ready in ${status.durationMs}ms · migrations ${status.migrationsApplied}/${status.migrationsAvailable} · seed ${status.seed}`,
      );
      if (status.seedError) console.error(`[borynx] seed failed and was rolled back: ${status.seedError}`);
    } else {
      state.__borynxDbPromise = undefined;
      console.error(`[borynx] database bootstrap failed during ${status.stage}: ${status.error}`);
    }
    return status;
  });
  state.__borynxDbPromise = run;
  return run;
}

/* ------------------------------------------------------------------ */
/* Live snapshot for /status                                           */
/* ------------------------------------------------------------------ */

export const TRACKED_TABLES = [
  "users",
  "user_aliases",
  "sessions",
  "spaces",
  "space_aliases",
  "memberships",
  "posts",
  "comments",
  "votes",
  "saves",
  "leads",
  "lead_bids",
  "reports",
  "mod_actions",
  "badges",
  "user_badges",
  "karma_events",
  "referrals",
] as const;

export interface LedgerEntry {
  id: number;
  tag: string;
  hash: string;
  generatedAt: string;
}

export interface DbSnapshot {
  version: string;
  database: string;
  sizeBytes: number;
  latencyMs: number;
  serverTime: string;
  ledger: LedgerEntry[];
  tables: Array<{ name: string; rows: number }>;
}

function journalTags(): Map<number, string> {
  try {
    const raw = fs.readFileSync(path.join(migrationsFolder(), "meta", "_journal.json"), "utf8");
    const journal = JSON.parse(raw) as { entries: Array<{ when: number; tag: string }> };
    return new Map(journal.entries.map((e) => [e.when, e.tag]));
  } catch {
    return new Map();
  }
}

export async function databaseSnapshot(): Promise<DbSnapshot> {
  const started = Date.now();
  const meta = await pool.query<{ version: string; database: string; size: string; now: string }>(
    "select version() as version, current_database() as database, pg_database_size(current_database())::text as size, now()::text as now",
  );
  const latencyMs = Date.now() - started;

  const union = TRACKED_TABLES.map((t) => `select '${t}'::text as name, count(*)::int as rows from "public"."${t}"`).join(" union all ");
  const [counts, ledgerRows] = await Promise.all([
    pool.query<{ name: string; rows: number }>(union),
    pool.query<{ id: number; hash: string; created_at: string }>(`select id, hash, created_at::text as created_at from ${LEDGER} order by id`),
  ]);
  const tags = journalTags();

  return {
    version: meta.rows[0]?.version ?? "unknown",
    database: meta.rows[0]?.database ?? "unknown",
    sizeBytes: Number(meta.rows[0]?.size ?? 0),
    latencyMs,
    serverTime: meta.rows[0]?.now ?? "",
    tables: counts.rows,
    ledger: ledgerRows.rows.map((r) => ({
      id: r.id,
      hash: r.hash,
      tag: tags.get(Number(r.created_at)) ?? "unknown",
      generatedAt: new Date(Number(r.created_at)).toISOString(),
    })),
  };
}
