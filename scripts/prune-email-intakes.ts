import { config } from "dotenv";
import { Pool } from "pg";
import { assertDemoDatabase } from "../src/lib/demo-mode";

async function main() {
  config({ path: [".env.local", ".env"], quiet: true });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Set DATABASE_URL explicitly for the intended database.");
  assertDemoDatabase({ ...process.env, NODE_ENV: "development" });
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    // One statement/transaction. Expired brief and contact details are gone; retain a short
    // fingerprint-only receipt for 410/retry and remove hourly throttle history after a day.
    const { rows: [counts] } = await pool.query(`
      with purged as (
        delete from borynx_private.lead_intakes where expires_at <= now() - interval '24 hours' returning 1
      ), redacted as (
        update borynx_private.lead_intakes set brief = null, display_name = null, company_name = null
        where expires_at <= now() and expires_at > now() - interval '24 hours' and brief is not null returning 1
      ), sends as (
        delete from borynx_private.email_auth_sends where attempted_at <= now() - interval '24 hours' returning 1
      ), sessions as (
        delete from public.sessions where expires_at <= now() returning 1
      )
      select (select count(*) from purged) as purged, (select count(*) from redacted) as redacted,
        (select count(*) from sends) as sends, (select count(*) from sessions) as sessions`);
    console.log(`Email auth retention: ${counts.redacted} scrubbed drafts, ${counts.purged} deleted receipts, ${counts.sends} deleted send reservations, ${counts.sessions} expired sessions.`);
  } finally {
    await pool.end();
  }
}

main().catch(() => { console.error("Email auth retention failed. Check the intended database, its credentials, and the migration ledger."); process.exitCode = 1; });
