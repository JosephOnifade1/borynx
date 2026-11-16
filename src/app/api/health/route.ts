import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureDatabase } from "@/db/bootstrap";

export const dynamic = "force-dynamic";

/** Healthy only when Postgres is reachable AND the Drizzle schema has been applied. */
export async function GET(): Promise<Response> {
  const status = await ensureDatabase();
  if (!status.ok) {
    return Response.json({ ok: false, stage: status.stage, error: status.error }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    await db.execute(sql`select 1`);
    return Response.json(
      {
        ok: true,
        db: {
          migrations: `${status.migrationsApplied}/${status.migrationsAvailable}`,
          baselined: status.baselined,
          seed: status.seed,
          bootMs: status.durationMs,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
}
