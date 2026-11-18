import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CursorPage, FeedLead, FeedPage, FeedPost, LeadFeedPage } from "../types";

const origin = process.env.BORYNX_DISCOVERY_TEST_ORIGIN;
const databaseUrl = process.env.BORYNX_DISCOVERY_TEST_DATABASE_URL;
// Never write test fixtures to a configured application database.
const enabled = /^http:\/\/127\.0\.0\.1:\d+$/.test(origin ?? "") &&
  /^postgresql:\/\/postgres:[a-f0-9]{48}@127\.0\.0\.1:\d+\/borynx_demo_lead_discovery$/.test(databaseUrl ?? "");

type Actor = { id: number; cookie: string };
type RequestOptions = { actor?: Actor; method?: string; json?: object; origin?: string };
const library = "/api/me/saved-leads";

function send(path: string, options: RequestOptions = {}) {
  return fetch(`${origin}${path}`, {
    method: options.method, redirect: "manual", signal: AbortSignal.timeout(30_000),
    headers: {
      ...(options.actor && { Cookie: options.actor.cookie }),
      ...(options.method && { Origin: options.origin ?? origin! }),
      ...(options.json && { "Content-Type": "application/json" }),
    },
    body: options.json ? JSON.stringify(options.json) : undefined,
  });
}

async function read<T>(response: Promise<Response>, status = 200): Promise<T> {
  const r = await response;
  expect(r.status).toBe(status);
  expect(r.headers.get("cache-control")).toContain("no-store");
  return r.json();
}

async function login(username: string): Promise<Actor> {
  const response = await send("/api/auth/login", { method: "POST", json: { username } });
  expect(response.status).toBe(200);
  const data = await response.json();
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  expect(cookie).toMatch(/^bx_session=/);
  return { id: data.user.id, cookie: cookie! };
}

async function markup(path: string, actor?: Actor) {
  const response = await send(path, { actor });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  return response.text();
}

const savePath = (id: number) => `/api/leads/${id}/save`;
const save = (id: number, actor?: Actor) => send(savePath(id), { method: "PUT", actor });
const unsave = (id: number, actor?: Actor) => send(savePath(id), { method: "DELETE", actor });
const board = (query: string, actor?: Actor) => read<LeadFeedPage>(send(`/api/leads?${query}`, { actor }));
const saved = (actor: Actor, params = "") => read<CursorPage<FeedLead>>(send(`${library}?${params}`, { actor }));
const ids = (page: CursorPage<FeedLead>) => page.items.map((lead) => lead.id);

type FixtureOptions = {
  min?: number; max?: number; currency?: string; unit?: string | null; skills?: string[]; status?: string;
  publication?: string; spaceId?: number; removed?: boolean; deadline?: string; createdAt?: string;
};

describe.skipIf(!enabled)("lead discovery and saves on disposable PostgreSQL", () => {
  let pool: Pool;
  let poster: Actor;
  let saver: Actor;
  let visitor: Actor;
  let reviewer: Actor;
  let privateSpace: number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
    [poster, saver, visitor, reviewer] = await Promise.all(["discovery-poster", "discovery-saver", "discovery-visitor", "discovery-reviewer"].map(login));
    const { rows: [space] } = await pool.query("insert into spaces (slug, name, privacy) values ('discovery-private', 'Hidden discovery space', 'private') returning id");
    privateSpace = space.id;
    await pool.query(`insert into leads
      (author_id, slug, title, description, category, budget_min, budget_max, currency, budget_unit, skill_tags, publication_status, created_at)
      select $1, 'newer-fixture-' || i, 'Newer Go listing ' || i, 'A published fixture outside the small React and Node.js result set.',
        'Software Engineering', 100, 400, 'USD', 'fixed', ARRAY['go'], 'published', '2025-06-01T00:00:00Z'::timestamptz + i * interval '1 second'
      from generate_series(1, 412) as i`, [poster.id]);
  });
  afterAll(async () => { await pool?.end(); });

  async function fixture(label: string, options: FixtureOptions = {}): Promise<{ id: number; title: string; slug: string; href: string }> {
    const {
      min = 100, max = 400, currency = "USD", unit = "fixed", skills = ["react"], status = "open",
      publication = "published", spaceId = null, removed = false, deadline = null, createdAt = "2024-01-01T00:00:00.000000Z",
    } = options;
    const title = `${label} Fixture`;
    const slug = title.toLowerCase().replaceAll(" ", "-");
    const { rows: [lead] } = await pool.query(`insert into leads
      (author_id, slug, title, description, category, budget_min, budget_max, currency, budget_unit, skill_tags,
        status, publication_status, space_id, is_removed, deadline_at, created_at)
      values ($1, $2, $3, 'Document a concrete deliverable without private pitch or intake data.', 'Software Engineering',
        $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning id`,
      [poster.id, slug, title, min, max, currency, unit, skills, status, publication, spaceId, removed, deadline, createdAt]);
    return { id: lead.id, title, slug, href: `/l/${lead.id}/${slug}` };
  }

  it("matches inclusive ranges and any normalized skill, but no other units, currencies, or hidden listings", async () => {
    const low = await fixture("Lower Edge", { min: 10, max: 50 });
    const high = await fixture("Upper Edge", { min: 500, max: 650, skills: ["node-js"] });
    const expired = await fixture("Expired Match", { deadline: "2021-01-01T00:00:00Z" });
    await fixture("One Below", { min: 10, max: 49 });
    await fixture("One Above", { min: 501, max: 700 });
    await fixture("Other Currency", { currency: "EUR" });
    await fixture("Hourly Budget", { unit: "hourly" });
    await fixture("Pending Discovery Canary", { publication: "pending_review" });
    await fixture("Removed Discovery Canary", { removed: true });
    await fixture("Private Discovery Canary", { spaceId: privateSpace });
    const filters = "currency=USD&unit=fixed&min=50&max=500&skill=Node.js&skill=React&skill=nodejs";
    const page = await board(`${filters}&sort=new`, reviewer);
    expect(ids(page)).toEqual([expired.id, high.id, low.id]);
    expect(page.total).toBe(3);
    expect(page.items[0]).toMatchObject({ acceptingBids: false, engagement: "deadline_passed" });
    expect(ids(await board(`${filters}&active=1`))).toEqual([high.id, low.id]);
    expect(ids(await board("currency=EUR&unit=fixed&min=50&max=500&skill=react"))).toHaveLength(1);
    expect(ids(await board("currency=USD&unit=hourly&max=100&skill=react"))).toHaveLength(1);
    const legacy = await board("skill=react&limit=50");
    expect(legacy.items.find((item) => item.slug === "discovery-legacy-lead")).toMatchObject({ budgetUnit: null, budgetMin: 50, budgetMax: 300 });
    const html = await markup(`/l?${filters}`);
    expect(html).toContain(low.title);
    expect(html).toContain(high.title);
    expect(html).not.toMatch(/Pending Discovery Canary|Removed Discovery Canary|Private Discovery Canary/);
  });

  it("paginates the exact New results past 400 and keeps Hot visibly separate", async () => {
    const query = "skill=go&currency=USD&unit=fixed&min=100&limit=50";
    let page = await board(query);
    const all: number[] = [];
    for (let iteration = 0; ; iteration++) {
      expect(page.total).toBe(412);
      all.push(...ids(page));
      if (!page.nextCursor) break;
      expect(iteration).toBeLessThan(9);
      page = await board(`${query}&cursor=${encodeURIComponent(page.nextCursor)}`);
    }
    expect(all).toHaveLength(412);
    expect(all).toEqual([...new Set(all)].sort((a, b) => b - a));
    expect((await board("sort=hot&limit=2")).total).toBe(400);
    expect(await markup("/l?sort=hot")).toContain("Unfiltered ranking of the 400 newest public leads.");
    expect(await read(send("/api/leads?sort=top&skill=go"), 422)).toMatchObject({ code: "invalid_lead_filters", fields: { sort: expect.any(String) } });
  });

  it("renders the same first page as HTTP and seeks across timestamp ties and sub-millisecond differences", async () => {
    const original = [];
    for (let i = 1; i <= 26; i++) original.push(await fixture(`Same Time ${i}`, { skills: ["figma"] }));
    const older = await fixture("One Microsecond Older", { skills: ["figma"], createdAt: "2023-12-31T23:59:59.999999Z" });
    const micro = await fixture("One Microsecond Newer", { skills: ["figma"], createdAt: "2024-01-01T00:00:00.000001Z" });
    const expected = [micro, ...original.reverse(), older];
    const query = "skill=figma&currency=USD&unit=fixed";
    const first = await board(query);
    expect(ids(first)).toEqual(expected.slice(0, 25).map((row) => row.id));
    expect(first.total).toBe(28);
    const html = await markup(`/l?${query}`);
    const region = html.match(/<section aria-label="Marketplace leads">([\s\S]*?)<\/section>/)?.[1];
    expect(region).toContain("Load more leads");
    const rendered = [...(region ?? "").matchAll(/<h3[^>]*><a[^>]* href="\/l\/(\d+)\/[^\"]+"[^>]*>/g)].map((match) => Number(match[1]));
    expect(rendered).toEqual(ids(first));
    expect(first.nextCursor).toBeTruthy();
    // Adding a newer match cannot shift or duplicate the continuation page.
    await fixture("New Arrival", { skills: ["figma"], createdAt: "2026-01-01T00:00:00Z" });
    const next = await board(`${query}&cursor=${encodeURIComponent(first.nextCursor!)}`);
    expect(ids(next)).toEqual(expected.slice(25).map((row) => row.id));
    expect(next.nextCursor).toBeNull();
    const tiny = await board(`${query}&limit=2`);
    expect(tiny.nextCursor).toContain(".000001Z:");
    expect((await board(`${query}&limit=2&cursor=${encodeURIComponent(tiny.nextCursor!)}`)).items[0]?.id).toBe(original[0].id);
  });

  it("rejects malformed filters and cursors without substituting an unfiltered result", async () => {
    await Promise.all([
      ["min=50", 422], ["currency=USD&unit=fixed&min=500&max=50", 422], ["skill=unknown", 422], ["limit=51", 422],
      ["cursor=25junk", 400], ["cursor=new:2026-02-30T12%3A00%3A00.000000Z:1", 400], ["sort=hot&cursor=top:25", 400],
    ].map(async ([query, status]) => {
      const response = await read<{ error: string }>(send(`/api/leads?${query}`), Number(status));
      expect(response.error).toBeTruthy();
    }));
    const page = await markup("/l?currency=USD&unit=fixed&min=10&max=1");
    expect(page).toContain("Maximum budget must be at least the minimum.");
    expect(page).not.toContain("Load more leads");
    expect(await board("author=missing-account")).toMatchObject({ items: [], nextCursor: null, total: 0 });
  });

  it("uses idempotent, session-owned saves and emits saved state only for the current viewer", async () => {
    const lead = await fixture("Private Bookmark", { skills: ["swift"] });
    const pending = await fixture("Private Pending Bookmark", { publication: "pending_review" });
    expect((await save(lead.id)).status).toBe(401);
    expect((await unsave(lead.id)).status).toBe(401);
    expect((await send(library)).status).toBe(401);
    const signedOut = await send("/saved?tab=leads");
    expect(signedOut.status).toBe(307);
    expect(signedOut.headers.get("location")).toContain("next=%2Fsaved%3Ftab%3Dleads");
    expect((await send(savePath(lead.id), { method: "PUT", actor: saver, origin: "https://outside.example.test" })).status).toBe(403);
    expect((await send("/api/leads/1oops/save", { method: "PUT", actor: saver })).status).toBe(400);
    expect((await save(pending.id, poster)).status).toBe(404);
    expect((await save(pending.id, reviewer)).status).toBe(404);

    const receipts = await Promise.all([read(save(lead.id, saver)), read(save(lead.id, saver))]);
    expect(receipts).toEqual([{ saved: true }, { saved: true }]);
    const rows = () => pool.query("select user_id, lead_id, created_at::text from borynx_private.lead_saves where lead_id = $1", [lead.id]).then(({ rows }) => rows);
    const original = await rows();
    expect(original).toHaveLength(1);
    expect(original[0]).toMatchObject({ user_id: saver.id, lead_id: lead.id });
    await read(save(lead.id, saver));
    expect(await rows()).toEqual(original);
    const filters = "skill=swift";
    expect((await board(filters)).items[0]).not.toHaveProperty("saved");
    expect((await board(filters, saver)).items[0]).toMatchObject({ saved: true });
    expect((await board(`${filters}&viewerId=${saver.id}`, visitor)).items[0]).toMatchObject({ saved: false });
    expect((await board(`${filters}&author=discovery-poster`, poster)).items[0]).toMatchObject({ saved: false });
    expect(ids(await saved(visitor, `userId=${saver.id}`))).toEqual([]);
    expect(ids(await saved(reviewer))).toEqual([]);
    expect(ids(await saved(saver))).toEqual([lead.id]);
    expect(await markup(lead.href, saver)).toMatch(/aria-label="Save lead" aria-pressed="true"/);
    expect(await markup(lead.href, visitor)).not.toMatch(/aria-label="Save lead" aria-pressed="true"/);
    expect(await markup(`/f/discovery-poster?tab=leads&${filters}`, saver)).toMatch(/aria-label="Save lead" aria-pressed="true"/);
    expect(await read(unsave(lead.id, visitor))).toEqual({ saved: false });
    expect(await rows()).toEqual(original);
    expect(await Promise.all([read(unsave(lead.id, saver)), read(unsave(lead.id, saver))])).toEqual([{ saved: false }, { saved: false }]);
    expect(await rows()).toEqual([]);
    await read(save(lead.id, saver));
    await pool.query("update users set is_banned = true where id = $1", [saver.id]);
    try {
      expect((await save(lead.id, saver)).status).toBe(403);
      expect(await read(unsave(lead.id, saver))).toEqual({ saved: false });
    } finally {
      await pool.query("update users set is_banned = false where id = $1", [saver.id]);
    }
  });

  it("orders by saved time, keeps unavailable public leads, and drops records as soon as visibility changes", async () => {
    const closed = await fixture("Saved Closed", { status: "closed" });
    const expired = await fixture("Saved Expired", { deadline: "2021-01-01T00:00:00Z" });
    const awarded = await fixture("Saved Awarded", { status: "awarded" });
    const { rows: [pitch] } = await pool.query("insert into lead_bids (lead_id, user_id, amount, message, is_accepted) values ($1,$2,120,'Private Save Award Pitch',true) returning id", [awarded.id, visitor.id]);
    await pool.query("update leads set assigned_user_id = $1, accepted_bid_id = $2, awarded_at = now(), bid_count = 1 where id = $3", [visitor.id, pitch.id, awarded.id]);
    const { rows: [space] } = await pool.query("insert into spaces (slug,name) values ('discovery-transition','Visibility transition fixture') returning id");
    const changing = await fixture("Becomes Private", { spaceId: space.id });
    const removed = await fixture("Becomes Removed");
    const review = await fixture("Returns To Review");
    for (const lead of [closed, expired, awarded, changing, removed, review]) await read(save(lead.id, saver));
    await pool.query(`update borynx_private.lead_saves set created_at = '2025-01-01T00:00:00.900001Z' where user_id = $1`, [saver.id]);
    await pool.query(`update borynx_private.lead_saves set created_at = '2025-01-01T00:00:00.900002Z' where user_id = $1 and lead_id = $2`, [saver.id, closed.id]);
    const first = await saved(saver, "limit=2");
    expect(ids(first)).toEqual([closed.id, review.id]);
    expect(first.nextCursor).toContain("saved:2025-01-01T00:00:00.900001Z:");
    expect(ids(await saved(saver, `limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`))).toEqual([removed.id, changing.id]);

    await pool.query("update spaces set privacy = 'restricted' where id = $1", [space.id]);
    await pool.query("update leads set is_removed = true where id = $1", [removed.id]);
    await pool.query("update leads set publication_status = 'changes_requested' where id = $1", [review.id]);
    const after = await saved(saver);
    expect(ids(after)).toEqual([closed.id, awarded.id, expired.id]);
    expect(after.items.map((lead) => lead.engagement)).toEqual(["closed", "awarded", "deadline_passed"]);
    expect(after.items.every((lead) => !lead.acceptingBids && lead.saved)).toBe(true);
    expect(JSON.stringify(after)).not.toContain("Private Save Award Pitch");
    const html = await markup("/saved?tab=leads", saver);
    const region = html.match(/<section aria-label="Saved leads">([\s\S]*?)<\/section>/)?.[1];
    expect(region).toContain("Unavailable");
    expect(region).not.toMatch(/Quick apply|Becomes Private Fixture|Becomes Removed Fixture|Returns To Review Fixture/);
    for (const lead of [changing, removed, review]) {
      expect((await save(lead.id, saver)).status).toBe(404);
      expect(await read(unsave(lead.id, saver))).toEqual({ saved: false });
    }
    const { rows: [count] } = await pool.query("select count(*)::int as n from borynx_private.lead_saves where user_id = $1", [saver.id]);
    expect(count.n).toBe(3);
  });

  it("leaves thread bookmarks intact and removes lead saves when the lead is deleted", async () => {
    const threadPage = () => send("/api/posts?saved=1", { actor: saver }).then((response) => response.json() as Promise<FeedPage<FeedPost>>);
    const [thread] = (await threadPage()).items;
    expect(thread.title).toBe("Existing saved thread fixture");
    expect(await markup("/saved", saver)).toContain(thread.title);
    const toggle = () => send(`/api/posts/${thread.id}/save`, { actor: saver, method: "POST" }).then((response) => response.json());
    expect(await toggle()).toEqual({ saved: false });
    expect((await threadPage()).items).toEqual([]);
    expect(await toggle()).toEqual({ saved: true });
    const disposable = await fixture("Cascade Bookmark");
    await read(save(disposable.id, saver));
    await read(save(disposable.id, visitor));
    await pool.query("delete from leads where id = $1", [disposable.id]);
    expect((await pool.query("select 1 from borynx_private.lead_saves where lead_id = $1", [disposable.id])).rowCount).toBe(0);
    expect(ids(await saved(saver))).not.toContain(disposable.id);
    expect(await read(unsave(disposable.id, saver))).toEqual({ saved: false });
  });
});
