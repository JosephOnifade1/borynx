import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import journal from "../drizzle/meta/_journal.json";
import { LEDGER, migrateDatabase, migrationsFolder } from "../src/db/migrations";
import type { DemoAccountMode } from "../src/lib/demo-mode";
import { DEMO_PERSONAS } from "../src/lib/demo-personas";
import { startLocalNext, startLocalProcess } from "./local-next";
import { checkEmailStaging } from "./test-email-auth";
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
      status: "awarded", publication_status: "published", assigned_user_id: winner.id, accepted_bid_id: bid.id,
      budget_min: 12, budget_max: 42, budget_unit: null, currency: "EUR", bid_count: 1, reviewed_by_id: null,
    });
    assert.deepEqual((await pool.query("select amount, is_accepted, message from lead_bids where id = $1", [bid.id])).rows[0], {
      amount: 24, is_accepted: true, message: "Existing accepted pitch",
    });
  });
  console.log("PASS upgrade from Phase 0 (0004) preserves an existing award and budget without inventing review evidence");
}

async function checkLegacyBids(url: string, directory: string) {
  const { folder, count } = await copyJournalPrefix(directory, "phase-one-migrations", 6);
  await usingDatabase(url, async (pool) => {
    assert.deepEqual(await migrateDatabase(pool, folder), { applied: count, available: count });
    const { rows: [buyer, winner, other] } = await pool.query(`insert into users (username, display_name) values
      ('old-buyer', 'Old Buyer'), ('old-winner', 'Old Winner'), ('old-other', 'Old Other') returning id`);
    const createLead = async (slug: string, status: string) => (await pool.query<{ id: number }>(`insert into leads
      (author_id, slug, title, description, category, status, publication_status, budget_min, budget_max, bid_count)
      values ($1, $2, $2, 'Original scope stays intact', 'Software Engineering', $3, 'published', 15, 80, 99) returning id`, [buyer.id, slug, status])).rows[0].id;
    const createBid = async (leadId: number, userId: number, message: string, accepted: boolean) => (await pool.query<{ id: number }>(`insert into lead_bids
      (lead_id, user_id, amount, message, is_accepted) values ($1, $2, 22, $3, $4) returning id`, [leadId, userId, message, accepted])).rows[0].id;
    const assign = (leadId: number, bidId: number, userId: number) => pool.query("update leads set accepted_bid_id = $1, assigned_user_id = $2 where id = $3", [bidId, userId, leadId]);
    const valid = await createLead("old-valid", "closed");
    const earlier = await createBid(valid, winner.id, "Earlier duplicate, keep privately", false);
    const picked = await createBid(valid, winner.id, "Canonical pitch", false);
    const stray = await createBid(valid, other.id, "Wrong accepted marker", true);
    await assign(valid, picked, winner.id);
    await pool.query("update leads set budget_unit = 'hourly', currency = 'GBP' where id = $1", [valid]);
    const ordinary = await createLead("old-unawarded", "closed");
    const first = await createBid(ordinary, other.id, "First unawarded pitch", false);
    const later = await createBid(ordinary, other.id, "Later duplicate, keep privately", false);
    const wrongLead = await createLead("old-cross-lead", "closed");
    await assign(wrongLead, picked, winner.id);
    const mismatch = await createLead("old-user-mismatch", "closed");
    const mismatchedBid = await createBid(mismatch, winner.id, "Preserve the disputed award evidence", true);
    await assign(mismatch, mismatchedBid, other.id);
    const reopened = await createLead("old-reopened", "open");
    const reopenedBid = await createBid(reopened, winner.id, "Previously selected on reopened listing", true);
    await assign(reopened, reopenedBid, winner.id);
    const reviewing = await createLead("old-in-review", "in_review");
    const markerOnly = await createLead("old-marker-only", "closed");
    const markerBid = await createBid(markerOnly, winner.id, "Marker alone does not identify a confirmed award", true);
    const self = await createLead("old-self-selection", "closed");
    const selfBid = await createBid(self, buyer.id, "Self-selection is not a credible engagement", true);
    await assign(self, selfBid, buyer.id);

    const expected = { applied: journal.entries.length, available: journal.entries.length };
    assert.deepEqual(await migrateDatabase(pool), expected);
    assert.deepEqual(await migrateDatabase(pool), expected);
    const upgraded = (await pool.query("select * from leads order by id")).rows;
    assert.deepEqual(upgraded.map((l) => [l.id, l.status, l.award_needs_review, l.bid_count]), [
      [valid, "awarded", false, 2], [ordinary, "closed", false, 1], [wrongLead, "closed", true, 0],
      [mismatch, "closed", true, 1], [reopened, "open", true, 1], [reviewing, "in_review", false, 0],
      [markerOnly, "closed", true, 1], [self, "closed", true, 1],
    ]);
    assert.ok(upgraded.every((l) => l.awarded_at === null && l.completed_at === null && l.budget_min === 15 && l.budget_max === 80 && l.publication_status === "published"));
    assert.deepEqual(upgraded.map((l) => [l.currency, l.budget_unit]), upgraded.map((l) => l.id === valid ? ["GBP", "hourly"] : ["USD", null]));
    assert.equal(upgraded.find((l) => l.id === wrongLead)?.accepted_bid_id, picked);
    assert.equal(upgraded.find((l) => l.id === mismatch)?.assigned_user_id, other.id);
    assert.deepEqual((await pool.query("select id from lead_bids where is_accepted order by id")).rows, [{ id: picked }]);
    assert.deepEqual((await pool.query("select id from lead_bids where lead_id = $1", [ordinary])).rows, [{ id: first }]);
    const archive = (await pool.query("select bid_id, amount, message, was_accepted, reason from lead_bid_archive order by bid_id")).rows;
    assert.deepEqual(archive.map((b) => [b.bid_id, b.was_accepted, b.reason]), [
      [earlier, false, "duplicate"], [stray, true, "legacy_acceptance"], [later, false, "duplicate"],
      [mismatchedBid, true, "legacy_acceptance"], [reopenedBid, true, "legacy_acceptance"],
      [markerBid, true, "legacy_acceptance"], [selfBid, true, "legacy_acceptance"],
    ]);
    assert.equal(archive[0].message, "Earlier duplicate, keep privately");
    assert.ok(archive.every((b) => b.amount === 22));
    assert.equal((await pool.query("select relrowsecurity from pg_class where oid = 'lead_bid_archive'::regclass")).rows[0].relrowsecurity, true);
    assert.equal((await pool.query("select count(*)::int as n from notifications")).rows[0].n, 0);
    assert.equal((await pool.query("select count(*)::int as n from karma_events")).rows[0].n, 0);
    await assert.rejects(createBid(valid, winner.id, "Disallowed duplicate", false), { code: "23505", constraint: "lead_bids_lead_user_idx" });
    await assert.rejects(pool.query("update lead_bids set is_accepted = true where id = $1", [stray]), { code: "23505", constraint: "lead_bids_one_winner_idx" });
  });
  console.log("PASS upgrade from Phase 1 (0005) archives duplicate bids and conflicting acceptance markers, classifies only consistent awards, and enforces both bid constraints");
}

async function checkMigrationFileBoundary(url: string, directory: string) {
  const { folder } = await copyJournalPrefix(directory, "failing-migration", journal.entries.length);
  const last = journal.entries[journal.entries.length - 1];
  await writeFile(join(folder, `${last.tag}.sql`), "create table public.rollback_probe (id int);--> statement-breakpoint\nselect 1 / 0;\n");
  await usingDatabase(url, async (pool) => {
    await assert.rejects(migrateDatabase(pool, folder), { code: "22012" });
    assert.equal((await pool.query("select to_regclass('public.rollback_probe') as probe")).rows[0].probe, null);
    assert.equal((await pool.query(`select count(*)::int as n from ${LEDGER}`)).rows[0].n, journal.entries.length - 1);
    assert.equal((await pool.query("select 'awarded'::lead_status as status")).rows[0].status, "awarded");
    assert.deepEqual(await migrateDatabase(pool), { applied: journal.entries.length, available: journal.entries.length });
  });
  console.log("PASS each file and ledger row commit together; failed backfill rolls back and resumes from the verified prefix");
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

function startNpmDev(url: string, port: number, demoOff: boolean) {
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error("Use npm run test:db to test the npm development command.");
  return startLocalProcess([npm, "run", "dev", "--", "--port", String(port)], {
    ...process.env,
    DATABASE_URL: url,
    // Empty values count as unset but keep a developer's .env.local from opting the test in or out.
    BORYNX_DEMO_MODE: demoOff ? "0" : "",
    BORYNX_DEMO_EXISTING_ACCOUNTS: "",
    BORYNX_EMAIL_AUTH: "0",
    BORYNX_EMAIL_SENDS: "0",
    COOKIE_SECURE: "",
  }, false, true);
}

async function withApp<T>(url: string, demo: DemoAccountMode | "npm-default" | "npm-disabled", run: (origin: string) => Promise<T>, ready = true) {
  const port = await freeLoopbackPort();
  const origin = `http://${LOOPBACK}:${port}`;
  const app = demo === "npm-default" || demo === "npm-disabled"
    ? startNpmDev(url, port, demo === "npm-disabled")
    : startLocalNext(url, demo, ["--hostname", LOOPBACK, "--port", String(port)]);
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
  await withApp(url, "disabled", async (origin) => {
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

async function runAppTests(files: string[], env: Record<string, string>) {
  const child = spawn(process.execPath, [join(process.cwd(), "node_modules", "vitest", "vitest.mjs"), "run", ...files, "--no-file-parallelism", "--testTimeout", "60000", "--hookTimeout", "30000"], {
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  const code = await new Promise((resolve, reject) => { child.once("close", resolve); child.once("error", reject); });
  assert.equal(code, 0, "Disposable app integration checks failed");
}

async function checkDemoApp(url: string) {
  return withApp(url, "personas", async (origin) => {
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
    assert.equal((await jsonPost(`${origin}/api/auth/login`, { username: "mara_k" })).status, 404, "the disposable preview must not expose other seeded accounts");
    assert.equal((await jsonPost(`${origin}/api/auth/login`, { username: "non-demo-account" })).status, 404);
    assert.equal((await jsonPost(`${origin}/api/auth/login`, { username: "non-demo-account", create: true })).status, 400);
    assert.equal((await jsonPost(`${origin}/api/leads`, {})).status, 401);
    assert.equal((await jsonPost(`${origin}/api/posts`, {})).status, 401);

    const board = await fetch(`${origin}/api/leads`);
    assert.equal(board.status, 200);
    const { items } = await board.json() as { items: { slug: string; href: string }[] };
    const billingLead = items.find((lead) => lead.slug === "build-a-usage-metering-billing-service-go-or-typescript-postgres-stripe");
    assert.ok(billingLead, "A fresh disposable demo must publish its sample billing lead");
    const detail = await fetch(new URL(`${billingLead.href}#bid`, origin), { redirect: "manual" });
    assert.equal(detail.status, 200, "The sample lead's Quick apply link must open the lead");
    const html = await detail.text();
    assert.match(html, /<h1[^>]*>Build a usage-metering &amp; billing service/);
    assert.match(html, /id="bid"/);
    console.log("PASS fresh demo boot; sample lead permalink, five fictional roles, hashed sessions, preview transports, and guest write rejection");
    await runAppTests(["src/lib/__tests__/post-author.integration.test.ts", "src/lib/__tests__/lead-publication.integration.test.ts"], {
      BORYNX_POST_TEST_ORIGIN: origin, BORYNX_LEAD_TEST_ORIGIN: origin, BORYNX_LEAD_TEST_DATABASE_URL: url,
    });
    return reviewerToken;
  });
}

async function checkRestoredDemoApp(url: string) {
  type Account = { id: number; username: string; role: string; karma: number };
  const { original, restored } = await usingDatabase(url, async (pool) => {
    const { rows: original } = await pool.query<Account>("select id, username, role, karma from users where username in ('mara_k', 'priya.builds') order by id");
    assert.equal(original.length, 2);
    await pool.query(`insert into users (username, display_name, is_banned, ban_expires_at) values
      ('lapsed.local', 'Lapsed Local Suspension', true, now() - interval '1 day'),
      ('restricted.local', 'Active Local Suspension', true, now() + interval '1 day')`);
    const { rows: [restored] } = await pool.query<Account>(`insert into users (username, display_name, karma)
      values ('restored.local', 'Restored Local Account', 123) returning id, username, role, karma`);
    return { original, restored };
  });

  const savedToken = await withApp(url, "existing", async (origin) => {
    const page = await fetch(`${origin}/login`).then((r) => r.text());
    assert.match(page, /Existing local accounts/);
    for (const account of original) assert.ok(page.includes(`f/${account.username}<`), `${account.username} is in the local picker`);
    // The picker is bounded; a valid account outside it can still be typed.
    assert.ok(!page.includes("Restored Local Account"), "the local picker is limited to 15 rows");
    assert.equal((await fetch(`${origin}/login?next=${encodeURIComponent("/\n/[invalid")}`)).status, 200);
    const tokens = new Map<string, string>();
    for (const account of [...original, restored]) {
      const login = await jsonPost(`${origin}/api/auth/login`, { username: `  F/${account.username.toUpperCase()}  ` }, { Origin: origin });
      assert.equal(login.status, 200, account.username);
      assert.match(login.headers.get("set-cookie") ?? "", /HttpOnly/);
      const { user, token } = await login.json();
      assert.deepEqual(user, { id: account.id, username: account.username });
      for (const { label, headers } of transports(token)) {
        const session = await fetch(`${origin}/api/me`, { headers }).then((r) => r.json());
        assert.equal(session.transport, label);
        assert.equal(session.user.id, account.id);
        assert.equal(session.user.role, account.role);
        assert.equal(session.user.karma, account.karma);
      }
      tokens.set(account.username, token);
    }
    assert.equal((await jsonPost(`${origin}/api/auth/login`, { username: "f/" })).status, 400);
    assert.equal((await jsonPost(`${origin}/api/auth/login`, { username: "name\0" })).status, 400);
    assert.equal((await jsonPost(`${origin}/api/auth/login`, { username: restored.username, create: true })).status, 400);
    assert.equal((await jsonPost(`${origin}/api/auth/login`, { username: "not-an-existing-user" })).status, 404);
    for (const username of ["spamlord99", "restricted.local"]) {
      const denied = await jsonPost(`${origin}/api/auth/login`, { username });
      assert.equal(denied.status, 403);
      assert.equal(denied.headers.get("set-cookie"), null);
    }
    assert.equal((await jsonPost(`${origin}/api/auth/login`, { username: "lapsed.local" })).status, 200);

    const token = tokens.get(restored.username)!;
    const cookie = { Cookie: `bx_session=${token}` };
    const draft = await jsonPost(`${origin}/api/leads`, {
      title: "Restored account checkout audit", description: "Check keyboard focus order and write a prioritized list of fixes for the checkout flow.", category: "Web & Mobile",
      kind: "contract", currency: "USD", budgetUnit: "fixed", budgetMin: 80, budgetMax: 120, skillTags: ["accessibility"], submissionKey: randomUUID(),
    }, cookie);
    assert.equal(draft.status, 201);
    const { id, href } = await draft.json();
    await usingDatabase(url, async (pool) => {
      assert.deepEqual((await pool.query("select author_id, publication_status from leads where id = $1", [id])).rows, [{ author_id: restored.id, publication_status: "pending_review" }]);
    });
    assert.equal((await fetch(`${origin}${href}`)).status, 404);
    assert.match(await fetch(`${origin}${href}`, { headers: cookie }).then((r) => r.text()), /Restored account checkout audit/);

    const previewHeaders = { "x-forwarded-host": "3000-preview.e2b.app" };
    const previewPage = await fetch(`${origin}/login`, { headers: previewHeaders }).then((r) => r.text());
    assert.match(previewPage, /Sign-in is unavailable/);
    assert.doesNotMatch(previewPage, /Existing local accounts|Seeded personas/);
    assert.equal((await jsonPost(`${origin}/api/auth/login`, { username: restored.username }, previewHeaders)).status, 404);
    assert.equal((await jsonPost(`${origin}/api/auth/login`, { username: restored.username }, { Origin: "https://elsewhere.example" })).status, 404);
    for (const { headers } of transports(token)) {
      assert.deepEqual(await fetch(`${origin}/api/me`, { headers: { ...headers, ...previewHeaders } }).then((r) => r.json()), { user: null, transport: "none" });
    }

    const admin = original.find((account) => account.role === "admin")!;
    const adminHeaders = { "x-bx-session": tokens.get(admin.username)! };
    await usingDatabase(url, (pool) => pool.query("update users set is_banned = true where id = $1", [admin.id]));
    try {
      const discipline = await fetch(`${origin}/api/mod/users/${restored.id}`, {
        method: "PATCH", headers: { ...adminHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ action: "warn" }),
      });
      assert.equal(discipline.status, 403, "an already signed-in suspended admin must not be able to moderate");
    } finally {
      await usingDatabase(url, (pool) => pool.query("update users set is_banned = false where id = $1", [admin.id]));
    }
    assert.equal((await jsonPost(`${origin}/api/auth/logout`, {}, adminHeaders)).status, 200);
    assert.deepEqual(await fetch(`${origin}/api/me`, { headers: adminHeaders }).then((r) => r.json()), { user: null, transport: "none" });
    return token;
  });

  await withApp(url, "personas", async (origin) => {
    for (const { headers } of transports(savedToken)) {
      assert.deepEqual(await fetch(`${origin}/api/me`, { headers }).then((r) => r.json()), { user: null, transport: "none" });
    }
  });
  console.log("PASS local existing accounts keep IDs and roles, sign in with all demo transports, and can draft a lead; rejects restricted accounts and rejects restored tokens in the preview");
}

async function checkDefaultDevSignIn(url: string) {
  const account = await usingDatabase(url, async (pool) => {
    await migrateDatabase(pool);
    const { rows: [account] } = await pool.query<{ id: number; username: string }>(`insert into users (username, display_name, role, karma)
      values ('my.existing.demo', 'Existing Demo Account', 'moderator', 57) returning id, username`);
    return account;
  });

  await withApp(url, "npm-default", async (origin) => {
    const page = await fetch(`${origin}/login`);
    assert.equal(page.status, 200);
    const body = await page.text();
    assert.match(body, /Existing local accounts/);
    assert.ok(body.includes(`f/${account.username}<`), "npm run dev must list the existing account without demo opt-ins");
    assert.doesNotMatch(body, /Seeded personas|Sign-in is unavailable/);
    const res = await jsonPost(`${origin}/api/auth/login`, { username: account.username }, { Origin: origin });
    assert.equal(res.status, 200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /^bx_session=.+; HttpOnly; SameSite=Lax$/);
    assert.deepEqual((await res.json()).user, account);
    const browser = { Cookie: setCookie.split(";")[0], Origin: origin };
    const session = await fetch(`${origin}/api/me`, { headers: browser }).then((r) => r.json());
    assert.equal(session.transport, "cookie");
    assert.equal(session.user.id, account.id);
    assert.equal(session.user.role, "moderator");
    assert.equal(session.user.karma, 57);
    assert.equal((await fetch(`${origin}/login`, { headers: browser, redirect: "manual" })).status, 307);
    assert.equal((await jsonPost(`${origin}/api/auth/logout`, {}, browser)).status, 200);
    assert.deepEqual(await fetch(`${origin}/api/me`, { headers: browser }).then((r) => r.json()), { user: null, transport: "none" });
    assert.equal((await jsonPost(`${origin}/api/auth/email`, { email: "no-send@example.test" })).status, 404);
    assert.equal((await jsonPost(`${origin}/api/auth/login`, { username: account.username }, { "x-forwarded-host": "preview.example" })).status, 404);
    await usingDatabase(url, async (pool) => {
      assert.deepEqual((await pool.query("select id, username from users")).rows, [account]);
    });
  });
  console.log("PASS npm run dev restores existing test-account sign-in in app_db without demo opt-ins, fixture seeding, or enabling email");
}

async function checkDisabledApp(url: string, oldDemoToken: string) {
  await withApp(url, "npm-disabled", async (origin) => {
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
    for (const endpoint of ["/api/auth/email", "/api/leads/intake", "/api/leads/intake/confirm"]) {
      const disabled = await jsonPost(`${origin}${endpoint}`, { email: "no-delivery@example.test" });
      assert.equal(disabled.status, 404);
      assert.equal(disabled.headers.get("set-cookie"), null);
    }
    const callback = await fetch(`${origin}/api/auth/callback?code=fixture`, { redirect: "manual" });
    assert.equal(callback.status, 404);
    assert.equal(callback.headers.get("set-cookie"), null);
    const status = await fetch(`${origin}/status`).then((r) => r.text());
    assert.match(status, /Service status/);
    assert.doesNotMatch(status, /Drizzle migration ledger|Database & runtime/);
  });
  console.log("PASS BORYNX_DEMO_MODE=0 under npm run dev seeds no users, posts or leads; hides the picker and rejects all demo credentials");
}

async function checkPhaseTwoEmailUpgrade(url: string, directory: string) {
  const phaseTwo = await copyJournalPrefix(directory, "phase2-migrations", 8);
  await usingDatabase(url, async (pool) => {
    assert.deepEqual(await migrateDatabase(pool, phaseTwo.folder), { applied: 8, available: 8 });
  });
  await checkEmailStaging(url, directory);
}

async function checkPhaseThreeProfileUpgrade(url: string, directory: string) {
  const phaseThree = await copyJournalPrefix(directory, "phase3-migrations", 9);
  const buyerId = await usingDatabase(url, async (pool) => {
    assert.deepEqual(await migrateDatabase(pool, phaseThree.folder), { applied: 9, available: 9 });
    const { rows: [buyer] } = await pool.query<{ id: number }>(`insert into users (username, display_name, company_name, role, karma) values
      ('profile-buyer', 'Profile Buyer', 'Intake Company Must Stay Private', 'member', 47),
      ('profile-worker', 'Profile Worker', null, 'member', 0),
      ('profile-reviewer', 'Profile Reviewer', null, 'moderator', 0) returning id`);
    return buyer.id;
  });
  await withApp(url, "npm-default", async (origin) => {
    await usingDatabase(url, async (pool) => {
      assert.deepEqual(await migrateDatabase(pool), { applied: journal.entries.length, available: journal.entries.length });
      const { rows: [buyer] } = await pool.query(`select id, company_name, company_name_public, looking_to_hire, available_for_work, hourly_rate, hourly_currency, karma
        from users where username = 'profile-buyer'`);
      assert.deepEqual(buyer, { id: buyerId, company_name: "Intake Company Must Stay Private", company_name_public: false,
        looking_to_hire: false, available_for_work: false, hourly_rate: null, hourly_currency: null, karma: 47 });
      await assert.rejects(pool.query("update users set hourly_rate = 30 where id = $1", [buyerId]), { constraint: "users_hourly_rate_pair" });
    });
    await runAppTests(["src/lib/__tests__/adaptive-profiles.integration.test.ts"], {
      BORYNX_PROFILE_TEST_ORIGIN: origin, BORYNX_PROFILE_TEST_DATABASE_URL: url,
    });
  });
  console.log("PASS Phase 3 upgrade keeps the original accounts and private intake name; profile settings run through plain npm run dev");
}

async function checkPortfolioUpgrade(url: string, directory: string) {
  const previous = await copyJournalPrefix(directory, "adaptive-profile-migrations", 10);
  const ownerId = await usingDatabase(url, async (pool) => {
    assert.deepEqual(await migrateDatabase(pool, previous.folder), { applied: 10, available: 10 });
    const { rows: [owner] } = await pool.query<{ id: number }>(`insert into users
      (username, display_name, looking_to_hire, available_for_work, company_name, hourly_rate, hourly_currency) values
      ('projects-owner', 'Portfolio Owner', true, true, 'Private Portfolio Intake Company', 90, 'EUR') returning id`);
    await pool.query(`insert into users (username, display_name, role) values
      ('projects-visitor', 'Portfolio Visitor', 'member'), ('projects-reviewer', 'Portfolio Reviewer', 'moderator'),
      ('projects-cap', 'Portfolio Curator', 'member')`);
    await pool.query(`do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    end $$;
    alter default privileges in schema borynx_private grant select on tables to anon, authenticated;`);
    return owner.id;
  });
  await withApp(url, "npm-default", async (origin) => {
    await usingDatabase(url, async (pool) => {
      assert.deepEqual(await migrateDatabase(pool), { applied: journal.entries.length, available: journal.entries.length });
      const { rows: [owner] } = await pool.query(`select id, company_name, company_name_public, looking_to_hire, available_for_work, hourly_rate, hourly_currency
        from users where username = 'projects-owner'`);
      assert.deepEqual(owner, { id: ownerId, company_name: "Private Portfolio Intake Company", company_name_public: false,
        looking_to_hire: true, available_for_work: true, hourly_rate: 90, hourly_currency: "EUR" });
      const { rows: tables } = await pool.query(`select c.relname, c.relrowsecurity,
        has_table_privilege('anon', c.oid, 'select') as anon_select,
        has_table_privilege('authenticated', c.oid, 'select') as authenticated_select
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'borynx_private' and c.relkind = 'r' and c.relname like 'portfolio_%'`);
      assert.equal(tables.length, 3);
      for (const table of tables) assert.deepEqual([table.relrowsecurity, table.anon_select, table.authenticated_select], [true, false, false]);
      assert.equal((await pool.query("select count(*)::int as n from borynx_private.portfolio_projects")).rows[0].n, 0);
    });
    await runAppTests(["src/lib/__tests__/portfolio.integration.test.ts"], {
      BORYNX_PROJECT_TEST_ORIGIN: origin, BORYNX_PROJECT_TEST_DATABASE_URL: url,
    });
  });
  console.log("PASS adaptive profile upgrade preserves owner data and keeps portfolio drafts, covers and decisions in app-only tables");
}

async function checkLeadDiscoveryUpgrade(url: string, directory: string) {
  const previous = await copyJournalPrefix(directory, "portfolio-migrations", 11);
  await usingDatabase(url, async (pool) => {
    assert.deepEqual(await migrateDatabase(pool, previous.folder), { applied: previous.count, available: previous.count });
    const { rows: [poster, saver] } = await pool.query<{ id: number }>(`insert into users (username, display_name) values
      ('discovery-poster', 'Discovery Poster'), ('discovery-saver', 'Discovery Saver'), ('discovery-visitor', 'Discovery Visitor') returning id`);
    await pool.query("insert into users (username, display_name, role) values ('discovery-reviewer', 'Discovery Reviewer', 'moderator')");
    const { rows: [space] } = await pool.query("insert into spaces (slug, name, privacy) values ('discovery-fixtures', 'Discovery Fixtures', 'public') returning id");
    const { rows: [thread] } = await pool.query(`insert into posts (space_id, author_id, slug, title, body) values
      ($1, $2, 'discovery-existing-thread', 'Existing saved thread fixture', 'A saved thread predating lead bookmarks.') returning id`, [space.id, poster.id]);
    await pool.query("insert into saves (user_id, post_id) values ($1, $2)", [saver.id, thread.id]);
    const { rows: [legacy] } = await pool.query(`insert into leads
      (author_id, slug, title, description, category, budget_min, budget_max, currency, skill_tags, publication_status, created_at) values
      ($1, 'discovery-legacy-lead', 'Legacy Unknown Unit Fixture', 'A public lead without a recorded budget unit.', 'Software Engineering', 50, 300, 'USD', ARRAY['react'], 'published', '2020-01-01T00:00:00Z')
      returning id, budget_unit, budget_min, budget_max, currency, publication_status`, [poster.id]);
    await pool.query(`insert into borynx_private.portfolio_projects (user_id, title, description, tech_tags, position)
      values ($1, 'Existing portfolio', 'This private portfolio remains in place after migration.', ARRAY['react'], 0)`, [saver.id]);
    await pool.query(`do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    end $$;
    alter default privileges in schema borynx_private grant select, insert, update, delete on tables to PUBLIC, anon, authenticated;`);

    const expected = { applied: journal.entries.length, available: journal.entries.length };
    assert.deepEqual(await migrateDatabase(pool), expected);
    assert.deepEqual(await migrateDatabase(pool), expected);
    assert.deepEqual((await pool.query(`select id, budget_unit, budget_min, budget_max, currency, publication_status
      from leads where id = $1`, [legacy.id])).rows[0], legacy);
    assert.deepEqual((await pool.query("select user_id, post_id from saves")).rows, [{ user_id: saver.id, post_id: thread.id }]);
    assert.equal((await pool.query("select count(*)::int as n from borynx_private.portfolio_projects")).rows[0].n, 1);
    const { rows: [privacy] } = await pool.query(`select relrowsecurity,
      has_table_privilege('anon', oid, 'select,insert,update,delete') as anon_access,
      has_table_privilege('authenticated', oid, 'select,insert,update,delete') as authenticated_access,
      exists (select 1 from aclexplode(relacl) where grantee = 0) as public_access
      from pg_class where oid = 'borynx_private.lead_saves'::regclass`);
    assert.deepEqual(privacy, { relrowsecurity: true, anon_access: false, authenticated_access: false, public_access: false });
    assert.equal((await pool.query("select count(*)::int as n from borynx_private.lead_saves")).rows[0].n, 0);
  });
  await withApp(url, "npm-default", (origin) => runAppTests(["src/lib/__tests__/lead-discovery.integration.test.ts"], {
    BORYNX_DISCOVERY_TEST_ORIGIN: origin, BORYNX_DISCOVERY_TEST_DATABASE_URL: url,
  }));
  console.log("PASS 0010 → 0011 preserves legacy budgets, thread saves and portfolios; lead bookmarks are app-only");
}

async function checkLeadReviewUpgrade(url: string, directory: string) {
  const previous = await copyJournalPrefix(directory, "lead-saves-migrations", 12);
  await usingDatabase(url, async (pool) => {
    assert.deepEqual(await migrateDatabase(pool, previous.folder), { applied: previous.count, available: previous.count });
    const { rows: [buyer, winner, moderator] } = await pool.query<{ id: number }>(`insert into users (username, display_name, role) values
      ('review-upgrade-buyer', 'Review Upgrade Buyer', 'member'), ('review-upgrade-winner', 'Review Upgrade Winner', 'member'),
      ('review-upgrade-moderator', 'Review Upgrade Moderator', 'moderator') returning id`);
    const { rows: [lead] } = await pool.query<{ id: number }>(`insert into leads (author_id, slug, title, description, category, status, publication_status, completed_at, assigned_user_id)
      values ($1, 'review-upgrade', 'Real completed award before reviews', 'Keep this existing scope.', 'Software Engineering', 'completed', 'published', '2025-08-02T12:00:00Z', $2) returning id`, [buyer.id, winner.id]);
    const { rows: [bid] } = await pool.query(`insert into lead_bids (lead_id, user_id, amount, message, is_accepted)
      values ($1, $2, 500, 'Keep this private proposal.', true) returning *`, [lead.id, winner.id]);
    const { rows: [completed] } = await pool.query("update leads set accepted_bid_id = $1, bid_count = 1 where id = $2 returning *", [bid.id, lead.id]);
    await pool.query("insert into borynx_private.lead_saves (lead_id, user_id) values ($1, $2)", [lead.id, moderator.id]);
    const { rows: [legacyReport] } = await pool.query(`insert into reports (reporter_id, target_type, target_id, reason, details)
      values ($1, 'lead', $2, 'off_topic', 'Existing lead report retained') returning *`, [moderator.id, lead.id]);
    await pool.query(`do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    end $$;
    alter default privileges in schema borynx_private grant select, insert, update, delete on tables to PUBLIC, anon, authenticated;
    alter default privileges in schema borynx_private grant usage, select, update on sequences to PUBLIC, anon, authenticated;`);

    const expected = { applied: journal.entries.length, available: journal.entries.length };
    assert.deepEqual(await migrateDatabase(pool), expected);
    assert.deepEqual(await migrateDatabase(pool), expected);
    assert.deepEqual((await pool.query("select * from leads where id = $1", [lead.id])).rows, [completed]);
    assert.deepEqual((await pool.query("select * from lead_bids where id = $1", [bid.id])).rows, [bid]);
    assert.deepEqual((await pool.query("select * from reports where id = $1", [legacyReport.id])).rows, [legacyReport]);
    assert.deepEqual((await pool.query("select user_id, lead_id from borynx_private.lead_saves")).rows, [{ user_id: moderator.id, lead_id: lead.id }]);
    for (const table of ["lead_reviews", "lead_review_decisions"]) {
      const { rows: [privacy] } = await pool.query(`select relrowsecurity,
        has_table_privilege('anon', oid, 'select,insert,update,delete,truncate,references,trigger') as anon_access,
        has_table_privilege('authenticated', oid, 'select,insert,update,delete,truncate,references,trigger') as authenticated_access,
        exists (select 1 from aclexplode(relacl) where grantee = 0) as public_access
        from pg_class where oid = $1::regclass`, [`borynx_private.${table}`]);
      assert.deepEqual(privacy, { relrowsecurity: true, anon_access: false, authenticated_access: false, public_access: false });
      const { rows: [sequence] } = await pool.query(`select has_sequence_privilege('anon', oid, 'usage,select,update') as anon_access,
        has_sequence_privilege('authenticated', oid, 'usage,select,update') as authenticated_access,
        exists (select 1 from aclexplode(relacl) where grantee = 0) as public_access
        from pg_class where oid = $1::regclass`, [`borynx_private.${table}_id_seq`]);
      assert.deepEqual(sequence, { anon_access: false, authenticated_access: false, public_access: false });
    }
    const { rows: [totals] } = await pool.query(`select
      (select count(*)::int from borynx_private.lead_reviews) as reviews,
      (select count(*)::int from borynx_private.lead_review_decisions) as decisions`);
    assert.deepEqual(totals, { reviews: 0, decisions: 0 });
    const insertReview = (rating: number, recipientId = winner.id) => pool.query(`insert into borynx_private.lead_reviews
      (lead_id, reviewer_id, recipient_id, rating, testimonial, visibility, reviewed_by_id, reviewed_at, review_note)
      values ($1, $2, $3, $4, 'A real engagement with a completed review fixture.', 'hidden', $5, now(), 'A test hide.') returning id`,
    [lead.id, buyer.id, recipientId, rating, moderator.id]);
    await assert.rejects(insertReview(0), { code: "23514", constraint: "lead_reviews_rating_range" });
    await assert.rejects(insertReview(6), { code: "23514", constraint: "lead_reviews_rating_range" });
    await assert.rejects(insertReview(4, buyer.id), { code: "23514", constraint: "lead_reviews_distinct_participants" });
    const { rows: [review] } = await insertReview(4);
    await assert.rejects(insertReview(5), { code: "23505", constraint: "lead_reviews_lead_id_unique" });
    await pool.query(`insert into borynx_private.lead_review_decisions (review_id, moderator_id, action, reason)
      values ($1, $2, 'hide', 'A test hide.')`, [review.id, moderator.id]);
    await pool.query("delete from users where id = $1", [moderator.id]);
    assert.deepEqual((await pool.query("select reviewed_by_id, visibility from borynx_private.lead_reviews where id = $1", [review.id])).rows, [{ reviewed_by_id: null, visibility: "hidden" }]);
    assert.deepEqual((await pool.query("select moderator_id, action from borynx_private.lead_review_decisions where review_id = $1", [review.id])).rows, [{ moderator_id: null, action: "hide" }]);
    await pool.query("delete from users where id = $1", [winner.id]);
    assert.deepEqual((await pool.query("select assigned_user_id from leads where id = $1", [lead.id])).rows, [{ assigned_user_id: null }]);
    assert.equal((await pool.query("select id from borynx_private.lead_reviews where id = $1", [review.id])).rowCount, 0);
    assert.equal((await pool.query("select id from borynx_private.lead_review_decisions where review_id = $1", [review.id])).rowCount, 0);
    // This suite supplies its own fictional accounts. It does not rely on demo auto-seeding.
    for (const user of DEMO_PERSONAS) {
      await pool.query("insert into users (username, display_name, headline, avatar_hue, role) values ($1, $2, $3, $4, $5)",
        [user.username, user.displayName, user.headline, user.avatarHue, user.role]);
    }
  });
  await withApp(url, "personas", (origin) => runAppTests(["src/lib/__tests__/lead-reviews.integration.test.ts"], {
    BORYNX_REVIEWS_TEST_ORIGIN: origin, BORYNX_REVIEWS_TEST_DATABASE_URL: url,
  }));
  console.log("PASS 0011 → 0012 preserves leads, accepted bids, saves and reports without backfilling reviews; app-only grants and deletion policy verified");
}

async function checkKickoffUpgrade(url: string, directory: string) {
  const previous = await copyJournalPrefix(directory, "engagement-reviews-migrations", 13);
  await usingDatabase(url, async (pool) => {
    assert.deepEqual(await migrateDatabase(pool, previous.folder), { applied: previous.count, available: previous.count });
    for (const user of DEMO_PERSONAS) {
      await pool.query("insert into users (username, display_name, headline, avatar_hue, role) values ($1, $2, $3, $4, $5)",
        [user.username, user.displayName, user.headline, user.avatarHue, user.role]);
    }
    const { rows: [buyer, winner] } = await pool.query<{ id: number }>("select id from users where username in ('demo-buyer', 'demo-bidder-a') order by id");
    const { rows: [active, finished] } = await pool.query<{ id: number }>(`insert into leads
      (author_id, slug, title, description, category, publication_status, status, assigned_user_id, completed_at) values
      ($1, 'kickoff-upgrade-award', 'Award predating kickoff', 'A retained fixture brief.', 'Software Engineering', 'published', 'awarded', $2, null),
      ($1, 'kickoff-upgrade-review', 'Review predating kickoff', 'A retained fixture brief.', 'Software Engineering', 'published', 'completed', $2, '2026-03-18T08:55:00Z')
      returning id`, [buyer.id, winner.id]);
    const { rows: bids } = await pool.query(`insert into lead_bids (lead_id, user_id, amount, message, is_accepted)
      values ($1, $3, 450, 'Private awarded pitch', true), ($2, $3, 650, 'Private completed pitch', true) returning *`, [active.id, finished.id, winner.id]);
    for (const bid of bids) await pool.query("update leads set accepted_bid_id = $1, bid_count = 1 where id = $2", [bid.id, bid.lead_id]);
    const { rows: priorLeads } = await pool.query("select * from leads order by id");
    const { rows: [review] } = await pool.query(`insert into borynx_private.lead_reviews (lead_id, reviewer_id, recipient_id, rating, testimonial, visibility)
      values ($1, $2, $3, 4, 'An existing review that should not change.', 'published') returning *`, [finished.id, buyer.id, winner.id]);
    const { rows: [notice] } = await pool.query(`insert into notifications (user_id, actor_id, type, entity_type, entity_id, message, href)
      values ($1, $2, 'lead_bid_accepted', 'lead', $3, 'A previous award notice', $4) returning *`, [winner.id, buyer.id, active.id, `/l/${active.id}/kickoff-upgrade-award#bid`]);
    await pool.query(`do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    end $$;
    alter default privileges in schema borynx_private grant all on tables to PUBLIC, anon, authenticated;`);
    const expected = { applied: journal.entries.length, available: journal.entries.length };
    assert.deepEqual(await migrateDatabase(pool), expected);
    assert.deepEqual(await migrateDatabase(pool), expected);
    assert.deepEqual((await pool.query("select * from leads order by id")).rows, priorLeads);
    assert.deepEqual((await pool.query("select * from lead_bids order by id")).rows, bids);
    assert.deepEqual((await pool.query("select * from borynx_private.lead_reviews")).rows, [review]);
    assert.deepEqual((await pool.query("select * from notifications")).rows, [notice]);
    assert.equal((await pool.query("select lead_id from borynx_private.lead_kickoffs")).rowCount, 0);
    assert.deepEqual((await pool.query(`select relrowsecurity,
      has_table_privilege('anon', oid, 'select,insert,update,delete,truncate,references,trigger') as anon_access,
      has_table_privilege('authenticated', oid, 'select,insert,update,delete,truncate,references,trigger') as authenticated_access,
      exists (select 1 from aclexplode(relacl) where grantee = 0) as public_access
      from pg_class where oid = 'borynx_private.lead_kickoffs'::regclass`)).rows,
    [{ relrowsecurity: true, anon_access: false, authenticated_access: false, public_access: false }]);
  });
  await withApp(url, "personas", (origin) => runAppTests(["src/lib/__tests__/lead-kickoff.integration.test.ts"], {
    BORYNX_KICKOFF_TEST_ORIGIN: origin, BORYNX_KICKOFF_TEST_DATABASE_URL: url,
  }));
  console.log("PASS 0012 → 0013 preserves awards, completed reviews and notices without inventing kickoff details; app-only grants verified");
}

for (const key of Object.keys(process.env)) if (key.startsWith("PG")) delete process.env[key];
withLocalPostgres(async ({ createDatabase, directory }) => {
  if (process.argv.includes("--email-only")) return checkPhaseTwoEmailUpgrade(await createDatabase("borynx_email_staging"), directory);
  if (process.argv.includes("--local-demo-only")) return checkDefaultDevSignIn(await createDatabase("app_db"));
  if (process.argv.includes("--profiles-only")) return checkPhaseThreeProfileUpgrade(await createDatabase("borynx_demo_profiles"), directory);
  if (process.argv.includes("--kickoff-only")) {
    await usingDatabase(await createDatabase("borynx_demo_kickoff_fresh"), async (pool) => {
      assert.deepEqual(await migrateDatabase(pool), { applied: journal.entries.length, available: journal.entries.length });
      assert.equal((await pool.query("select lead_id from borynx_private.lead_kickoffs")).rowCount, 0);
    });
    return checkKickoffUpgrade(await createDatabase("borynx_demo_kickoff"), directory);
  }
  if (process.argv.includes("--lead-reviews-only")) {
    await usingDatabase(await createDatabase("borynx_demo_lead_reviews_fresh"), async (pool) => {
      assert.deepEqual(await migrateDatabase(pool), { applied: journal.entries.length, available: journal.entries.length });
      assert.equal((await pool.query("select id from borynx_private.lead_reviews")).rowCount, 0);
      assert.equal((await pool.query("select id from borynx_private.lead_review_decisions")).rowCount, 0);
    });
    return checkLeadReviewUpgrade(await createDatabase("borynx_demo_lead_reviews"), directory);
  }
  if (process.argv.includes("--lead-discovery-only")) {
    await usingDatabase(await createDatabase("borynx_demo_lead_discovery_fresh"), async (pool) => {
      assert.deepEqual(await migrateDatabase(pool), { applied: journal.entries.length, available: journal.entries.length });
      assert.equal((await pool.query("select count(*)::int as n from borynx_private.lead_saves")).rows[0].n, 0);
    });
    return checkLeadDiscoveryUpgrade(await createDatabase("borynx_demo_lead_discovery"), directory);
  }
  if (process.argv.includes("--projects-only")) {
    await usingDatabase(await createDatabase("borynx_demo_projects_fresh"), async (pool) => {
      assert.deepEqual(await migrateDatabase(pool), { applied: journal.entries.length, available: journal.entries.length });
      assert.equal((await pool.query("select count(*)::int as n from borynx_private.portfolio_projects")).rows[0].n, 0);
    });
    return checkPortfolioUpgrade(await createDatabase("borynx_demo_projects"), directory);
  }
  await checkMigrationUpgrade(await createDatabase("borynx_demo_upgrade"), directory);
  await checkPhaseZeroUpgrade(await createDatabase("borynx_demo_phase0_upgrade"), directory);
  await checkLegacyBids(await createDatabase("borynx_demo_phase1_upgrade"), directory);
  await checkMigrationFileBoundary(await createDatabase("borynx_demo_resume"), directory);
  const untrackedUrl = await createDatabase("borynx_demo_untracked");
  await checkUntrackedSchema(untrackedUrl);
  await checkBlockedStartup(untrackedUrl);
  const demoUrl = await createDatabase("borynx_demo");
  const oldDemoToken = await checkDemoApp(demoUrl);
  await checkRestoredDemoApp(demoUrl);
  await checkDefaultDevSignIn(await createDatabase("app_db"));
  await checkDisabledApp(await createDatabase("borynx_disabled"), oldDemoToken);
  const engagementUrl = await createDatabase("borynx_demo_engagement");
  await withApp(engagementUrl, "personas", (origin) => runAppTests(["src/lib/__tests__/lead-engagement.integration.test.ts"], {
    BORYNX_ENGAGEMENT_TEST_ORIGIN: origin, BORYNX_ENGAGEMENT_TEST_DATABASE_URL: engagementUrl,
  }));
  await checkPhaseTwoEmailUpgrade(await createDatabase("borynx_email_staging"), directory);
  await checkPhaseThreeProfileUpgrade(await createDatabase("borynx_demo_profiles"), directory);
  await checkPortfolioUpgrade(await createDatabase("borynx_demo_projects"), directory);
  await checkLeadDiscoveryUpgrade(await createDatabase("borynx_demo_lead_discovery"), directory);
  await checkLeadReviewUpgrade(await createDatabase("borynx_demo_lead_reviews"), directory);
  await checkKickoffUpgrade(await createDatabase("borynx_demo_kickoff"), directory);
}).catch((error) => { console.error(error); process.exitCode = 1; });
