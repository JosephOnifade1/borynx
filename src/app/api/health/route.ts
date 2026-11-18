import { pool } from "@/db";
import { ensureDatabase } from "@/db/bootstrap";

export const dynamic = "force-dynamic";

/** Readiness only. Connection and migration diagnostics stay in server logs. */
export async function GET(): Promise<Response> {
  let ok = false;
  try {
    if ((await ensureDatabase()).ok) {
      await pool.query("select 1");
      ok = true;
    }
  } catch {
    // Treat a failed connection probe as unavailable without leaking connection details.
  }
  return Response.json({ ok }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
