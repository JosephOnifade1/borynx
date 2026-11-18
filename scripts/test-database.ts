import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import journal from "../drizzle/meta/_journal.json";
import { LEDGER, migrateDatabase, migrationsFolder } from "../src/db/migrations";
import { DEMO_PERSONAS } from "../src/lib/demo-personas";
import { startLocalNext } from "./local-next";
import { freeLoopbackPort, LOOPBACK, withLocalPostgres } from "./local-postgres";

async function usingDatabase<T>(url: string, run: (pool: Pool) => Promise<T>) {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5_000 });
  try { return await run(pool); } finally { await pool.end(); }
}

async function copyJournalPrefix(directory: string, name: string, length: number) {
  const folder = join(directory, name);
  const entries = journal.entries.slice(0, length);
  await mkdir(join(folder, "meta"), { recursive: true });
  await writeFile(join(folder, "meta", "_journal.json"), JSON.stringify({ ...journal, entries }));
  for (const { tag } of entries) await copyFile(join(migrationsFolder(), `${tag}.sql`), join(folder, `${tag}.sql`));
  return { folder, count: entries.length };
}

async function checkMigrationUpgrade(url: string, directory: string) {
  // Stop before lead award columns (0003) and author actions (0004). Copy exact historical files.
  const { folder, count } = await copyJournalPrefix(directory, "legacy-migrations", 3);
  await usingDatabase(url, async (pool) => {
    assert.deepEqual(await migrateDatabase(pool, folder), { applied: count, available: count });
    const { rows: [buyer] } = await pool.query("insert into users (username, display_name) values ('legacy-buyer', 'Legacy Buyer') returning id");
    const { rows: [bidder] } = await pool.query("insert into users (username, display_name) values ('legacy-bidder', 'Legacy Bidder') returning id");
    const { rows: [lead] } = await pool.query("insert into leads (author_id, slug, title, description, category, status) values ($1, 'old-lead', 'Legacy brief', 'Original scope', 'Software Engineering', 'closed') returning id", [buyer.id]);
    const { rows: [bid] } = await pool.query("insert into lead_bids (lead_id, user_id, amount, message) values ($1, $2, 300, 'Legacy pitch') returning id", [lead.id, bidder.id]);
    const { rows: [space] } = await pool.query("insert into spaces (slug, name) values ('legacy-space', 'Legacy Space') returning id");
    const { rows: [post] } = await pool.query("insert into posts (space_id, author_id, slug, title, body) values ($1, $2, 'legacy-thread', 'Legacy thread', '## Original text') returning id", [space.id, buyer.id]);
    const { rows: hiddenSpaces } = await pool.query("insert into spaces (slug, name, privacy) values ('legacy-restricted', 'Legacy Restricted', 'restricted'), ('legacy-private', 'Legacy Private', 'private') returning id, privacy");
    for (const hidden of hiddenSpaces) {
      await pool.query("insert into leads (author_id, space_id, slug, title, description, category, is_verified) values ($1, $2, $3, 'Hidden legacy lead', 'Do not publish', 'Software Engineering', true)", [buyer.id, hidden.id, `legacy-${hidden.privacy}`]);
    }
    await pool.query(`insert into leads (author_id, space_id, slug, title, description, category, budget_min, budget_max, currency, is_removed)
      values ($1, $2, 'legacy-public', 'Previously public', 'Keep its original budget', 'Software Engineering', 3, 8, 'GBP', false),
             ($1, null, 'legacy-removed', 'Previously removed', 'Still removed', 'Software Engineering', 3, 8, 'GBP', true)`, [buyer.id, space.id]);

    const expected = { applied: journal.entries.length, available: journal.entries.length };
    const results = await Promise.all([migrateDatabase(pool), migrateDatabase(pool)]);
    assert.deepEqual(results, [expected, expected]);
    const ledger = await pool.query(`select id, hash, created_at from ${LEDGER} order by id`);
    assert.deepEqual(await migrateDatabase(pool), expected);
    assert.deepEqual((await pool.query(`select id, hash, created_at from ${LEDGER} order by id`)).rows, ledger.rows);
    assert.deepEqual((await pool.query("select author_id, slug, title, description, status, accepted_bid_id, assigned_user_id from leads where id = $1", [lead.id])).rows[0], {
      author_id: buyer.id, slug: "old-lead", title: "Legacy brief", description: "Original scope", status: "closed", accepted_bid_id: null, assigned_user_id: null,
    });
    assert.deepEqual((await pool.query("select lead_id, user_id, amount, message, is_accepted from lead_bids where id = $1", [bid.id])).rows[0], {
      lead_id: lead.id, user_id: bidder.id, amount: 300, message: "Legacy pitch", is_accepted: false,
    });
    assert.deepEqual((await pool.query("select slug, body, edited_at, author_deleted_at from posts where id = $1", [post.id])).rows[0], {
      slug: "legacy-thread", body: "## Original text", edited_at: null, author_deleted_at: null,
    });
    const { rows: publication } = await pool.query("select slug, publication_status, budget_unit, budget_min, budget_max, currency, reviewed_at, published_at from leads order by slug");
    assert.deepEqual(publication.map((r) => [r.slug, r.publication_status]), [
      ["legacy-private", "pending_review"], ["legacy-public", "published"], ["legacy-removed", "pending_review"],
      ["legacy-restricted", "pending_review"], ["old-lead", "published"],
    ]);
    assert.ok(publication.every((r) => r.budget_unit === null && r.reviewed_at === null && r.published_at === null));
    assert.deepEqual(publication.find((r) => r.slug === "legacy-public"), {
      slug: "legacy-public", publication_status: "published", budget_unit: null, budget_min: 3, budget_max: 8, currency: "GBP", reviewed_at: null, published_at: null,
    });
    // A ledger row isn't proof of origin merely because its timestamp looks familiar.
    await pool.query(`update ${LEDGER} set hash = 'unknown' where id = (select min(id) from ${LEDGER})`);
    await assert.rejects(migrateDatabase(pool), /migration history does not match/);
  });
  console.log("PASS upgrade from 0002 preserves legacy brief, bid, and thread and only publishes known-public legacy leads; concurrent/repeat runs do not double-apply; mismatched ledger is rejected");
}

async function checkPhaseZeroUpgrade(url: string, directory: string) {
  const { folder, count } = await copyJournalPrefix(directory, "phase-zero-migrations", 5);
  await usingDatabase(url, async (pool) => {
    assert.deepEqual(await migrateDatabase(pool, folder), { applied: count, available: count });
    const { rows: [owner, winner] } = await pool.query("insert into users (username, display_name) values ('legacy-employer', 'Legacy Employer'), ('legacy-winner', 'Legacy Winner') returning id");
    const { rows: [lead] } = await pool.query(`insert into leads (author_id, slug, title, description, category, status, budget_min, budget_max, currency, assigned_user_id)
      values ($1, 'old-awarded-lead', 'Already awarded', 'Preserve this closed listing as-is', 'Software Engineering', 'closed', 12, 42, 'EUR', $2) returning id`, [owner.id, winner.id]);
    const { rows: [bid] } = await pool.query("insert into lead_bids (lead_id, user_id, amount, message, is_accepted) values ($1, $2, 24, 'Existing accepted pitch', true) returning id", [lead.id, winner.id]);
    await pool.query("update leads set accepted_bid_id = $1, bid_count = 1 where id = $2", [bid.id, lead.id]);
    assert.deepEqual(await migrateDatabase(pool), { applied: journal.entries.length, available: journal.entries.length });
    const { rows: [updated] } = await pool.query(`select status, publication_status, assigned_user_id, accepted_bid_id, budget_min, budget_max, budget_unit, currency, bid_count, reviewed_by_id
      from leads where id = $1`, [lead.id]);
    assert.deepEqual(updated, {
      status: "closed", publication_status: "published", assigned_user_id: winner.id, accepted_bid_id: bid.id,
      budget_min: 12, budget_max: 42, budget_unit: null, currency: "EUR", bid_count: 1, reviewed_by_id: null,
    });
    assert.deepEqual((await pool.query("select amount, is_accepted, message from lead_bids where id = $1", [bid.id])).rows[0], {
      amount: 24, is_accepted: true, message: "Existing accepted pitch",
    });
  });
  console.log("PASS upgrade from Phase 0 (0004) preserves an existing award and budget without inventing review evidence");
}

async function checkUntrackedSchema(url: string) {
  await usingDatabase(url, async (pool) => {
    await pool.query("create table public.users (handle text not null)");
    await pool.query("insert into public.users values ('keep-existing-data')");
    await assert.rejects(migrateDatabase(pool), /Untracked schema/);
    assert.equal((await pool.query("select to_regclass($1) as ledger", [LEDGER])).rows[0].ledger, null);
    assert.deepEqual((await pool.query("select handle from public.users")).rows, [{ handle: "keep-existing-data" }]);
  });
  console.log("PASS untracked schema is rejected without creating a migration ledger or changing data");
}

async function withApp<T>(url: string, demo: boolean, run: (origin: string) => Promise<T>, ready = true) {
  const port = await freeLoopbackPort();
  const origin = `http://${LOOPBACK}:${port}`;
  const app = startLocalNext(url, demo, ["--hostname", LOOPBACK, "--port", String(port)]);
  try {
    const deadline = Date.now() + 60_000;
    while (!app.logs.includes("Ready in")) {
      if (app.child.exitCode !== null || app.child.signalCode !== null || Date.now() > deadline) throw new Error("Next did not start");
      await delay(150);
    }
    const health = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(30_000) });
    assert.equal(health.status, ready ? 200 : 503);
    assert.deepEqual(await health.json(), { ok: ready });
    return await run(origin);
  } catch (error) {
    console.error(app.logs);
    throw error;
  } finally {
    await app.stop();
  }
}

async function checkBlockedStartup(url: string) {
  await withApp(url, false, async (origin) => {
    const response = await fetch(`${origin}/api/leads`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Database unavailable", code: "db_unavailable" });
    const page = await fetch(`${origin}/status`).then((r) => r.text());
    assert.match(page, /Borynx is temporarily unavailable/);
    assert.doesNotMatch(page, /Untracked schema|drizzle.__drizzle_migrations|DATABASE_URL/);
  }, false);
  console.log("PASS an untracked database reports not ready without public migration diagnostics");
}

function jsonPost(url: string, json: object, headers?: Record<string, string>) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(json) });
}

function transports(token: string) {
  return [
    { label: "cookie", headers: { Cookie: `bx_session=${token}` } },
    { label: "header", headers: { "x-bx-session": token } },
    { label: "header", headers: { Authorization: `Bearer ${token}` } },
  ] as const;
}

async function runMarketplaceAndAuthorTests(origin: string, url: string) {
  const child = spawn(process.execPath, [join(process.cwd(), "node_modules", "vitest", "vitest.mjs"), "run", "src/lib/__tests__/post-author.integration.test.ts", "src/lib/__tests__/lead-publication.integration.test.ts", "--no-file-parallelism", "--testTimeout", "60000", "--hookTimeout", "30000"], {
    env: { ...process.env, BORYNX_POST_TEST_ORIGIN: origin, BORYNX_LEAD_TEST_ORIGIN: origin, BORYNX_LEAD_TEST_DATABASE_URL: url },
    stdio: "inherit",
  });
  const code = await new Promise((resolve, reject) => { child.once("close", resolve); child.once("error", reject); });
  assert.equal(code, 0, "Disposable app integration checks failed");
}

async function checkDemoApp(url: string) {
  return withApp(url, true, async (origin) => {
    await usingDatabase(url, async (pool) => {
      const count = (await pool.query(`select count(*)::int as n from ${LEDGER}`)).rows[0].n;
      assert.equal(count, journal.entries.length);
    });
    const page = await fetch(`${origin}/login`).then((r) => r.text());
    assert.match(page, /Seeded personas/);
    let reviewerToken = "";
    for (const persona of DEMO_PERSONAS) {
      assert.ok(page.includes(persona.displayName));
      const login = await jsonPost(`${origin}/api/auth/login`, { username: persona.username });
      assert.equal(login.status, 200);
      assert.match(login.headers.get("set-cookie") ?? "", /HttpOnly/);
      const { token } = await login.json() as { token: string };
      for (const { label, headers } of transports(token)) {
        const session = await fetch(`${origin}/api/me`, { headers }).then((r) => r.json());
        assert.equal(session.transport, label);
        assert.equal(session.user.username, persona.username);
        assert.equal(session.user.role, persona.role);
      }
      if (persona.username === "demo-reviewer") reviewerToken = token;
    }
    assert.ok(reviewerToken);
    const hash = createHash("sha256").update(reviewerToken).digest("hex");
    await usingDatabase(url, async (pool) => {
      const { rows } = await pool.query("select 1 from sessions where id = $1", [hash]);
      assert.equal(rows.length, 1);
    });
    assert.equal((await jsonPost(`${origin}/api/auth/login`, { username: "non-demo-account" })).status, 404);
    assert.equal((await jsonPost(`${origin}/api/auth/login`, { username: "non-demo-account", create: true })).status, 400);
    assert.equal((await jsonPost(`${origin}/api/leads`, {})).status, 401);
    assert.equal((await jsonPost(`${origin}/api/posts`, {})).status, 401);
    console.log("PASS fresh app boot; five fictional roles, hashed sessions, preview transports, and guest write rejection");
    await runMarketplaceAndAuthorTests(origin, url);
    return reviewerToken;
  });
}

async function checkDisabledApp(url: string, oldDemoToken: string) {
  await withApp(url, false, async (origin) => {
    await usingDatabase(url, async (pool) => {
      const { rows: [state] } = await pool.query("select (select count(*)::int from users) as users, (select count(*)::int from posts) as posts, (select count(*)::int from leads) as leads, (select count(*)::int from badges) as badges");
      assert.equal(state.users, 0);
      assert.equal(state.posts, 0);
      assert.equal(state.leads, 0);
      assert.ok(state.badges > 0);
      // Simulate a legacy privileged demo session that existed before the rollout.
      const { rows: [reviewer] } = await pool.query("insert into users (username, display_name, role) values ('demo-reviewer', 'Old Demo Reviewer', 'moderator') returning id");
      const hash = createHash("sha256").update(oldDemoToken).digest("hex");
      await pool.query("insert into sessions (id, user_id, expires_at) values ($1, $2, now() + interval '1 day')", [hash, reviewer.id]);
    });
    const page = await fetch(`${origin}/login`).then((r) => r.text());
    assert.match(page, /Sign-in is unavailable/);
    assert.doesNotMatch(page, /Seeded personas|__bxDemoMode|Old Demo Reviewer/);
    const login = await jsonPost(`${origin}/api/auth/login`, { username: "demo-reviewer" });
    assert.equal(login.status, 404);
    assert.equal(login.headers.get("set-cookie"), null);
    for (const { headers } of transports(oldDemoToken)) {
      assert.deepEqual(await fetch(`${origin}/api/me`, { headers }).then((r) => r.json()), { user: null, transport: "none" });
      assert.equal((await jsonPost(`${origin}/api/leads`, {}, headers)).status, 401);
    }
    const status = await fetch(`${origin}/status`).then((r) => r.text());
    assert.match(status, /Service status/);
    assert.doesNotMatch(status, /Drizzle migration ledger|Database & runtime/);
  });
  console.log("PASS demo-off boot seeds no users, posts or leads; hides picker/diagnostics and rejects sign-in and all old demo transports");
}

for (const key of Object.keys(process.env)) if (key.startsWith("PG")) delete process.env[key];
withLocalPostgres(async ({ createDatabase, directory }) => {
  await checkMigrationUpgrade(await createDatabase("borynx_demo_upgrade"), directory);
  await checkPhaseZeroUpgrade(await createDatabase("borynx_demo_phase0_upgrade"), directory);
  const untrackedUrl = await createDatabase("borynx_demo_untracked");
  await checkUntrackedSchema(untrackedUrl);
  await checkBlockedStartup(untrackedUrl);
  const oldDemoToken = await checkDemoApp(await createDatabase("borynx_demo"));
  await checkDisabledApp(await createDatabase("borynx_disabled"), oldDemoToken);
}).catch((error) => { console.error(error); process.exitCode = 1; });
