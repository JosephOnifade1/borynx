import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isDemoDatabaseUrl } from "../demo-mode";

const origin = process.env.BORYNX_LEAD_TEST_ORIGIN;
const databaseUrl = process.env.BORYNX_LEAD_TEST_DATABASE_URL;
const enabled = Boolean(origin && new URL(origin).hostname === "127.0.0.1" && isDemoDatabaseUrl(databaseUrl));

type Actor = { id: number; token: string };
const variant = () => randomUUID().slice(0, 8);
const brief = (title: string, overrides: Record<string, unknown> = {}) => ({
  title, description: "Deliver a reproducible accessibility audit for three checkout screens, including a ranked remediation list and example fixes.",
  deliveryTimeline: "One week from kickoff",
  category: "Web & Mobile", kind: "contract", budgetMin: 1000, budgetMax: 2500,
  currency: "USD", budgetUnit: "fixed", skillTags: ["react", "accessibility"], submissionKey: randomUUID(), ...overrides,
});
const pitch = { message: "I can deliver the requested audit and document keyboard-navigation fixes with before and after evidence.", amount: 1250 };

function request(path: string, options: { actor?: Actor; method?: string; body?: object } = {}) {
  const headers = new Headers();
  if (options.actor) headers.set("x-bx-session", options.actor.token);
  if (options.body) headers.set("Content-Type", "application/json");
  return fetch(`${origin}${path}`, { method: options.method, headers, redirect: "manual", body: options.body ? JSON.stringify(options.body) : undefined });
}

async function login(username: string): Promise<Actor> {
  const response = await request("/api/auth/login", { method: "POST", body: { username } });
  expect(response.status).toBe(200);
  const { user, token } = await response.json();
  return { id: user.id, token };
}

const post = (path: string, body: object, actor?: Actor) => request(path, { method: "POST", body, actor });
const patch = (path: string, body: object, actor: Actor) => request(path, { method: "PATCH", body, actor });
const review = (id: number, revision: number, action: string, actor: Actor, reason?: string) => patch(`/api/mod/leads/${id}`, { revision, action, reason }, actor);

async function createLead(title: string, actor: Actor) {
  const response = await post("/api/leads", brief(title), actor);
  expect(response.status).toBe(201);
  return await response.json() as { id: number; href: string; revision: number };
}

async function expectHidden(id: number, title: string, actor?: Actor) {
  const detail = await request(`/l/${id}/not-the-slug`, { actor });
  expect(detail.status).toBe(404);
  expect(detail.headers.get("location")).toBeNull();
  expect(await detail.text()).not.toContain(title);
}

describe.skipIf(!enabled)("lead publication on disposable PostgreSQL", () => {
  let pool: Pool;
  let buyer: Actor;
  let reviewer: Actor;
  let observer: Actor;
  let bidderA: Actor;
  let bidderB: Actor;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
    [buyer, reviewer, observer, bidderA, bidderB] = await Promise.all([
      login("demo-buyer"), login("demo-reviewer"), login("demo-observer"), login("demo-bidder-a"), login("demo-bidder-b"),
    ]);
  });
  afterAll(async () => { await pool?.end(); });

  it("lets a guest open the draft, but denies writes and validates new submissions", async () => {
    const title = `Invalid guest test ${variant()}`;
    const page = await request("/l/new");
    expect(page.status).toBe(200);
    expect(await page.text()).toMatch(/Draft a lead[\s\S]*Continue to sign in/);
    expect((await post("/api/leads", brief(title))).status).toBe(401);
    const belowFloor = await post("/api/leads", brief(title, { currency: "GBP", budgetUnit: "hourly", budgetMin: 15, budgetMax: 40 }), buyer);
    expect(belowFloor.status).toBe(422);
    expect(await belowFloor.json()).toMatchObject({ fields: { budgetMin: expect.stringContaining("GBP 16") } });
    expect((await post("/api/leads", brief(title, { description: "This is a fictional test for a scam requesting guaranteed income, a promise to double your money, and nothing to deliver." }), buyer)).status).toBe(422);
    const { rows: [space] } = await pool.query("insert into spaces (slug, name, privacy) values ('phase-one-private', 'Private test space', 'private') returning slug");
    const privateLink = await post("/api/leads", brief(title, { spaceSlug: space.slug }), buyer);
    expect(privateLink.status).toBe(422);
    expect(await privateLink.json()).toMatchObject({ fields: { spaceSlug: expect.any(String) } });
    expect((await pool.query("select id from leads where title = $1", [title])).rowCount).toBe(0);
  });

  it("hides a single queued lead everywhere, supports corrections, and publishes only the current revision", async () => {
    const title = `Private checkout accessibility study ${variant()}`;
    const spaceSlug = "software-engineering";
    const payload = brief(title, {
      spaceSlug,
      description: "Audit checkout flow keyboard navigation and return a documented list of defects. The sample text says no interview needed for testing the safety flag.",
    });
    const before = await request("/api/leads").then((r) => r.json());
    const responses = await Promise.all([post("/api/leads", payload, buyer), post("/api/leads", payload, buyer)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
    const [submission, retry] = await Promise.all(responses.map((r) => r.json()));
    expect(retry).toEqual(submission);
    const { id, href } = submission;
    expect(submission).toMatchObject({ href: `/l/${id}`, publicationStatus: "pending_review", revision: 1 });
    const another = await post("/api/leads", brief("A second valid brief for the same buyer"), buyer);
    expect(another.status).toBe(409);
    expect(await another.json()).toMatchObject({ code: "active_lead_limit" });
    expect(await request("/l/new", { actor: buyer }).then((r) => r.text())).toContain("You already have an active lead");
    expect((await pool.query("select id from leads where author_id = $1 and submission_key = $2", [buyer.id, payload.submissionKey])).rowCount).toBe(1);
    expect((await request("/api/leads").then((r) => r.json())).total).toBe(before.total);
    for (const actor of [undefined, observer]) {
      await expectHidden(id, title, actor);
      for (const path of ["/l", "/", "/api/leads?sort=hot", "/api/leads?author=demo-buyer", "/f/demo-buyer?tab=leads", `/api/search?q=${encodeURIComponent(title)}`]) {
        const response = await request(path, { actor });
        expect(response.status, path).toBe(200);
        expect(await response.text(), path).not.toContain(title);
      }
    }
    const ownerPage = await request(href, { actor: buyer });
    const ownerHtml = await ownerPage.text();
    expect(ownerPage.status).toBe(200);
    expect(ownerHtml).toContain(title);
    expect(ownerHtml).toContain("Pending review");
    expect(ownerHtml).toContain("noindex");
    expect(ownerHtml).not.toContain("Copy attributed link");
    expect((await request("/l/new", { actor: buyer }).then((r) => r.text()))).toContain(title);
    expect((await request("/mod/queue", { actor: reviewer }).then((r) => r.text()))).toContain(title);
    expect((await request("/api/notifications", { actor: buyer }).then((r) => r.text()))).not.toContain(title);

    for (const [path, body] of [
      [`/api/leads/${id}/bids`, pitch], [`/api/leads/${id}/vote`, { value: 1 }],
      [`/api/leads/${id}/bids/1/accept`, {}], ["/api/reports", { targetType: "lead", targetId: id, reason: "spam_scam" }],
    ] as const) expect((await post(path, body, bidderA)).status, path).toBe(404);
    expect((await patch(`/api/leads/${id}/status`, { action: "close_without_hire" }, bidderA)).status).toBe(404);
    expect((await patch(`/api/leads/${id}/status`, { action: "close_without_hire" }, buyer)).status).toBe(409);
    expect((await patch(`/api/leads/${id}`, { ...payload, revision: 1 }, bidderA)).status).toBe(404);

    const { rows: [flag] } = await pool.query("select r.id, r.space_id from reports r where target_type = 'lead' and target_id = $1 and reason = 'automated_filter'", [id]);
    expect(flag).toBeDefined();
    await pool.query("insert into memberships (user_id, space_id, mod_role) values ($1, $2, 'moderator') on conflict (user_id, space_id) do update set mod_role = excluded.mod_role", [observer.id, flag.space_id]);
    const spaceQueue = await request("/b/software-engineering/mod", { actor: observer });
    expect(spaceQueue.status).toBe(200);
    expect(await spaceQueue.text()).not.toContain("no interview needed");
    expect((await review(id, 1, "publish", observer)).status).toBe(403);
    expect((await patch(`/api/mod/reports/${flag.id}`, { action: "dismiss" }, observer)).status).toBe(404);
    expect((await patch(`/api/mod/reports/${flag.id}`, { action: "dismiss" }, reviewer)).status).toBe(200);
    await expectHidden(id, title);

    const reason = "Please state the expected format of the audit report.";
    expect((await review(id, 1, "request_changes", reviewer)).status).toBe(422);
    expect((await review(id, 1, "request_changes", reviewer, reason)).status).toBe(200);
    expect((await request(href, { actor: buyer }).then((r) => r.text()))).toContain(reason);
    const notices = await request("/api/notifications", { actor: buyer }).then((r) => r.json());
    expect(notices.notifications).toEqual(expect.arrayContaining([expect.objectContaining({ type: "lead_review_decision", entityId: id, href, message: expect.stringContaining(reason) })]));
    expect((await request("/api/notifications", { actor: observer }).then((r) => r.text()))).not.toContain(reason);

    expect((await post("/api/leads", brief("A returned brief still occupies the active slot"), buyer)).status).toBe(409);
    const revised = brief(`${title} revised`, { spaceSlug, revision: 1, deliveryTimeline: "Within five days of kickoff" });
    for (const invalid of [{ deliveryTimeline: undefined }, { budgetMin: 0, budgetMax: 0 }]) {
      expect((await patch(`/api/leads/${id}`, { ...revised, ...invalid }, buyer)).status).toBe(422);
    }
    const correction = await patch(`/api/leads/${id}`, revised, buyer);
    expect(correction.status).toBe(200);
    expect(await correction.json()).toMatchObject({ id, publicationStatus: "pending_review", revision: 2 });
    expect((await patch(`/api/leads/${id}`, revised, buyer)).status).toBe(409);
    expect((await review(id, 1, "publish", reviewer)).status).toBe(409);
    await expectHidden(id, revised.title);
    const decisions = await Promise.all([review(id, 2, "publish", reviewer), review(id, 2, "publish", reviewer)]);
    expect(decisions.map((r) => r.status).sort()).toEqual([200, 409]);
    const short = await request(href);
    expect(short.status).toBe(308);
    const publicPath = new URL(short.headers.get("location")!, origin).pathname;
    const publishedHtml = await request(publicPath).then((r) => r.text());
    expect(publishedHtml).toContain(revised.title);
    expect(publishedHtml).toContain(revised.deliveryTimeline);
    expect(publishedHtml).not.toContain(reason);
    expect((await request("/api/leads").then((r) => r.json())).total).toBe(before.total + 1);
    const submissions = await request("/l/new", { actor: buyer }).then((r) => r.text());
    expect(submissions).toContain(revised.title);
    expect(submissions).toContain('>Published<');
    expect(await request(`/api/search?q=${encodeURIComponent(revised.title)}`).then((r) => r.text())).toContain(revised.title);
    expect(await request("/f/demo-buyer?tab=leads").then((r) => r.text())).toContain(revised.title);
    expect((await patch(`/api/leads/${id}`, { ...revised, revision: 2 }, buyer)).status).toBe(409);

    expect((await post(`/api/leads/${id}/bids`, pitch, bidderA)).status).toBe(201);
    expect(await request(publicPath).then((r) => r.text())).not.toContain(pitch.message);
    expect(await request(publicPath, { actor: bidderB }).then((r) => r.text())).not.toContain(pitch.message);
    expect(await request(publicPath, { actor: buyer }).then((r) => r.text())).toContain(pitch.message);
    await pool.query("update leads set deadline_at = now() - interval '1 minute' where id = $1", [id]);
    expect((await post(`/api/leads/${id}/bids`, pitch, bidderB)).status).toBe(409);
    expect(await request(publicPath).then((r) => r.text())).toContain("Deadline passed");
    expect((await post("/api/leads", brief("An elapsed deadline doesn’t close the first lead"), buyer)).status).toBe(409);
    await pool.query("update leads set deadline_at = null where id = $1", [id]);
    expect((await patch(`/api/leads/${id}/status`, { action: "close_without_hire" }, buyer)).status).toBe(200);
    expect((await post(`/api/leads/${id}/bids`, pitch, bidderB)).status).toBe(409);
    expect((await request(publicPath)).status).toBe(200);
  });

  it("blocks self-review, rejection without reason, and publishing a withdrawn brief", async () => {
    const own = await createLead(`Reviewer authored lead ${variant()}`, reviewer);
    expect((await review(own.id, 1, "publish", reviewer)).status).toBe(403);
    await expectHidden(own.id, "Reviewer authored lead");
    const withdrawn = await createLead(`Withdrawn private lead ${variant()}`, buyer);
    expect((await patch(`/api/leads/${withdrawn.id}/status`, { action: "withdraw" }, buyer)).status).toBe(200);
    expect((await review(withdrawn.id, 1, "publish", reviewer)).status).toBe(409);
    expect((await post("/api/leads", brief(`Third lead while rate limited ${variant()}`), buyer)).headers.get("retry-after")).toBe("900");
    const decline = await createLead(`Declined private lead ${variant()}`, bidderA);
    expect((await review(decline.id, 1, "reject", reviewer)).status).toBe(422);
    expect((await review(decline.id, 1, "reject", reviewer, "Work is outside the supported disciplines.")).status).toBe(200);
    expect(await request(decline.href, { actor: bidderA }).then((r) => r.text())).toContain("Not approved");
    await expectHidden(decline.id, "Declined private lead");
  });

  it("rechecks publication and public discovery when a linked space is no longer public", async () => {
    const title = `Visibility follows the linked space ${variant()}`;
    const { rows: [space] } = await pool.query("insert into spaces (slug, name) values ('phase-one-space', 'Phase One Space') returning id, slug");
    const response = await post("/api/leads", brief(title, { spaceSlug: space.slug }), observer);
    expect(response.status).toBe(201);
    const { id, href } = await response.json();
    await pool.query("update spaces set privacy = 'restricted' where id = $1", [space.id]);
    expect((await review(id, 1, "publish", reviewer)).status).toBe(409);
    await expectHidden(id, title);
    await pool.query("update spaces set privacy = 'public' where id = $1", [space.id]);
    expect((await review(id, 1, "publish", reviewer)).status).toBe(200);
    expect(await request("/api/leads?author=demo-observer").then((r) => r.text())).toContain(title);
    await pool.query("update spaces set privacy = 'private' where id = $1", [space.id]);
    await expectHidden(id, title, bidderB);
    await expectHidden(id, title);
    expect(await request("/api/leads?author=demo-observer").then((r) => r.json())).toMatchObject({ total: 0, items: [] });
    expect(await request(`/api/search?q=${encodeURIComponent(title)}`).then((r) => r.text())).not.toContain(title);
    expect(await request(href, { actor: observer }).then((r) => r.text())).toContain(title);
    expect((await post(`/api/leads/${id}/bids`, pitch, bidderB)).status).toBe(404);
    expect((await patch(`/api/leads/${id}/status`, { action: "close_without_hire" }, observer)).status).toBe(200);
    await expectHidden(id, title, bidderB);
  });

  it("resolves only pending sibling reports of the same type and cannot publish a removed submission", async () => {
    const lead = await createLead(`Report moderation target ${variant()}`, bidderB);
    const { rows: list } = await pool.query(`insert into reports (target_type, target_id, reason, status) values
      ('lead', $1, 'spam_scam', 'pending'), ('lead', $1, 'misleading_bounty', 'pending'),
      ('lead', $1, 'off_topic', 'dismissed'), ('post', $1, 'off_topic', 'pending') returning id`, [lead.id]);
    expect((await patch(`/api/mod/reports/${list[0].id}`, { action: "approve" }, reviewer)).status).toBe(200);
    const { rows } = await pool.query("select status from reports where id = any($1::int[]) order by id", [list.map((r) => r.id)]);
    expect(rows.map((r) => r.status)).toEqual(["approved", "approved", "dismissed", "pending"]);
    expect((await patch(`/api/mod/reports/${list[0].id}`, { action: "dismiss" }, reviewer)).status).toBe(409);
    expect((await review(lead.id, 1, "publish", reviewer)).status).toBe(409);
    expect((await pool.query("select is_removed, publication_status from leads where id = $1", [lead.id])).rows[0]).toEqual({ is_removed: true, publication_status: "pending_review" });
  });
});
