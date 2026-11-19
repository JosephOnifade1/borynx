import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const origin = process.env.BORYNX_KICKOFF_TEST_ORIGIN;
const databaseUrl = process.env.BORYNX_KICKOFF_TEST_DATABASE_URL;
const app = origin && URL.canParse(origin) ? new URL(origin) : null;
const database = databaseUrl && URL.canParse(databaseUrl) ? new URL(databaseUrl) : null;
const enabled = app?.protocol === "http:" && app.origin === origin && app.hostname === "127.0.0.1" && Boolean(app.port) &&
  database?.protocol === "postgresql:" && database.hostname === "127.0.0.1" && Boolean(database.port) &&
  database.pathname === "/borynx_demo_kickoff" && !database.search && !database.hash;
const kickoff = { note: "Private kickoff marker: check the <em>first step</em> with me before testing.", contact: "private-kickoff@example.test", startDate: "2028-02-29" };
const signInEmail = "account-email-not-shared@example.test";

type Actor = { id: number; token: string };
type Listing = { id: number; slug: string };
type FixtureOptions = { status?: string; publication?: string; spaceId?: number; removed?: boolean };
type Notice = { type: string; entityId: number; message: string; href: string };

function send(path: string, actor?: Actor, method = "GET", body?: unknown, from = origin) {
  const headers = new Headers();
  if (from && method !== "GET") headers.set("Origin", from);
  if (actor) headers.set("x-bx-session", actor.token);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return fetch(`${origin}${path}`, { method, headers, redirect: "manual", body: body === undefined ? undefined : JSON.stringify(body) });
}

async function read<T = unknown>(pending: Promise<Response>, status = 200): Promise<T> {
  const response = await pending;
  expect(response.status, `${response.url}: ${response.status === status ? "" : await response.clone().text()}`).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  return response.json() as Promise<T>;
}

async function login(username: string): Promise<Actor> {
  const res = await send("/api/auth/login", undefined, "POST", { username });
  expect(res.status, username).toBe(200);
  const { user, token } = await res.json();
  return { id: user.id, token };
}

async function markup(path: string, actor?: Actor) {
  const response = await send(path, actor);
  expect(response.status, path).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  return (await response.text()).replaceAll("<!-- -->", "");
}

const leadPath = ({ id, slug }: Listing) => `/l/${id}/${slug}`;
const kickoffPath = (id: number) => `/api/leads/${id}/kickoff`;
const sendDetails = (id: number, actor?: Actor, body: unknown = kickoff) => send(kickoffPath(id), actor, "POST", body);
const ack = (id: number, actor?: Actor) => send(kickoffPath(id), actor, "PATCH", { action: "acknowledge" });
const outcome = (id: number, actor: Actor, action: "complete" | "cancel") => send(`/api/leads/${id}/status`, actor, "PATCH", { action });
const inbox = (actor: Actor) => read<{ notifications: Notice[] }>(send("/api/notifications?limit=60", actor));

// No direct writes unless the disposable loopback runner supplied both test endpoints.
describe.skipIf(!enabled)("private award kickoff on disposable PostgreSQL", () => {
  let pool: Pool;
  let buyer: Actor;
  let winner: Actor;
  let loser: Actor;
  let moderator: Actor;
  let observer: Actor;
  let privateSpace: number;
  const fixtureIds: number[] = [];

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
    [buyer, winner, loser, moderator, observer] = await Promise.all(
      ["demo-buyer", "demo-bidder-a", "demo-bidder-b", "demo-reviewer", "demo-observer"].map(login),
    );
    await pool.query("insert into borynx_private.auth_identities (provider, subject, user_id, email, verified_at) values ('https://fixture.invalid', $1, $2, $3, now())", [randomUUID(), buyer.id, signInEmail]);
    const { rows: [space] } = await pool.query("insert into spaces (slug, name, privacy) values ('kickoff-private-fixture', 'Private kickoff fixture', 'private') returning id");
    privateSpace = space.id;
  });
  afterEach(async () => {
    await pool.query("update users set is_banned = false where id = any($1::int[])", [[buyer.id, winner.id]]);
    await pool.query("delete from notifications where entity_type = 'lead' and entity_id = any($1::int[])", [fixtureIds]);
    await pool.query("delete from reports where target_type = 'lead' and target_id = any($1::int[])", [fixtureIds]);
    await pool.query("delete from leads where id = any($1::int[])", [fixtureIds.splice(0)]);
  });
  afterAll(async () => { await pool?.end(); });

  async function fixture(options: FixtureOptions = {}) {
    const { status = "open", publication = "published", spaceId = null, removed = false } = options;
    const { rows: [row] } = await pool.query<Listing>(`insert into leads (author_id, slug, title, description, category, status, publication_status, space_id, is_removed)
      values ($1, $2, 'Kickoff test brief', 'An isolated fixture for private post-award coordination.', 'Software Engineering', $3, $4, $5, $6) returning id, slug`,
    [buyer.id, `kickoff-fixture-${randomUUID()}`, status, publication, spaceId, removed]);
    fixtureIds.push(row.id);
    return row;
  }

  async function awarded(options?: FixtureOptions, recipient = winner.id) {
    const row = await fixture({ status: "awarded", ...options });
    const { rows: [bid] } = await pool.query<{ id: number }>(`insert into lead_bids (lead_id, user_id, amount, message, is_accepted)
      values ($1, $2, 500, 'This is a private winning pitch before kickoff.', true) returning id`, [row.id, recipient]);
    await pool.query("update leads set accepted_bid_id = $1, assigned_user_id = $2, bid_count = 1 where id = $3", [bid.id, recipient, row.id]);
    return { ...row, bidId: bid.id };
  }

  const row = (id: number) => pool.query("select * from borynx_private.lead_kickoffs where lead_id = $1", [id]).then((r) => r.rows);
  const notices = (id: number) => pool.query("select user_id, actor_id, message, href from notifications where type = 'lead_kickoff' and entity_id = $1 order by id", [id]).then((r) => r.rows);
  async function expectErased(id: number) {
    expect(await row(id)).toEqual([]);
    expect(await notices(id)).toEqual([]);
  }

  it("unlocks a private kickoff after a real award and delivers exactly one notice on concurrent sends", async () => {
    const lead = await fixture();
    expect(await markup(leadPath(lead), buyer)).not.toContain('id="kickoff"');
    expect(await read(sendDetails(lead.id, buyer), 409)).toMatchObject({ code: "kickoff_unavailable" });
    const { id: bidId } = await read<{ id: number }>(send(`/api/leads/${lead.id}/bids`, winner, "POST", { amount: 500, message: "I will review your checkout and deliver a keyboard accessibility report." }), 201);
    await read(send(`/api/leads/${lead.id}/bids`, loser, "POST", { amount: 450, message: "I can review the same checkout and prepare a prioritized task list." }), 201);
    await read(send(`/api/leads/${lead.id}/bids/${bidId}/accept`, buyer, "POST"));
    const awardNotice = (await inbox(winner)).notifications.find((item) => item.type === "lead_bid_accepted" && item.entityId === lead.id);
    expect(awardNotice?.href).toBe(`${leadPath(lead)}#kickoff`);
    expect(await markup(leadPath(lead), buyer)).toContain("Send kickoff details");
    expect(await markup(leadPath(lead), winner)).toContain("You won — waiting for kickoff details.");
    expect(await read(ack(lead.id, winner), 409)).toMatchObject({ code: "kickoff_missing" });
    for (const actor of [winner, loser, observer, moderator]) expect(await read(sendDetails(lead.id, actor), 403)).toMatchObject({ code: "forbidden" });
    expect(await read(sendDetails(lead.id), 401)).toMatchObject({ code: "unauthenticated" });
    expect(await read(send(kickoffPath(lead.id), buyer, "POST", kickoff, "https://another-origin.invalid"), 403)).toMatchObject({ code: "invalid_origin" });
    await pool.query("update users set is_banned = true where id = $1", [buyer.id]);
    expect(await read(sendDetails(lead.id, buyer), 403)).toMatchObject({ code: "restricted" });
    expect(await markup(leadPath(lead), buyer)).not.toContain('id="kickoff"');
    await pool.query("update users set is_banned = false where id = $1", [buyer.id]);

    const duplicates = await Promise.all([sendDetails(lead.id, buyer), sendDetails(lead.id, buyer, { ...kickoff, contact: `  ${kickoff.contact} ` })]);
    expect(duplicates.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await duplicates.find((r) => r.status === 201)!.json()).toEqual({ state: "sent" });
    expect(await duplicates.find((r) => r.status === 409)!.json()).toMatchObject({ code: "kickoff_exists" });
    expect(await row(lead.id)).toEqual([expect.objectContaining({ lead_id: lead.id, bid_id: bidId, buyer_id: buyer.id, winner_id: winner.id,
      note: kickoff.note, contact: kickoff.contact, acknowledged_at: null,
    })]);
    expect(await notices(lead.id)).toEqual([{ user_id: winner.id, actor_id: buyer.id, href: `${leadPath(lead)}#kickoff`, message: "The buyer sent kickoff details for “Kickoff test brief”." }]);
    const winnerHtml = await markup(leadPath(lead), winner);
    expect(winnerHtml).toContain("2028-02-29");
    expect(winnerHtml).toContain("&lt;em&gt;first step&lt;/em&gt;");
    expect(winnerHtml).not.toContain("<em>first step</em>");
    expect(winnerHtml).toContain(kickoff.contact);
    expect(winnerHtml).toContain("Acknowledge details");
    const buyerHtml = await markup(leadPath(lead), buyer);
    expect(buyerHtml).toContain("Waiting for the winner to acknowledge these details.");
    expect(buyerHtml).not.toContain("Send kickoff details");
    expect(buyerHtml).toContain(kickoff.contact);
    expect(winnerHtml + buyerHtml).not.toContain(signInEmail);
    for (const actor of [undefined, loser, observer, moderator]) {
      const html = await markup(leadPath(lead), actor);
      expect(html).not.toContain('id="kickoff"');
      expect(html).not.toContain(kickoff.contact);
      expect(html).not.toContain("Private kickoff marker");
    }
    expect((await send(kickoffPath(lead.id), winner)).status).toBe(405);
    const feed = await send("/api/leads").then((r) => r.json());
    const publicItem = feed.items.find((item: { id: number }) => item.id === lead.id);
    expect(publicItem).toMatchObject({ status: "awarded", engagement: "awarded" });
    expect(publicItem).not.toHaveProperty("kickoff");
    expect(JSON.stringify(publicItem)).not.toContain(kickoff.contact);
    expect(JSON.stringify(publicItem)).not.toContain("Private kickoff marker");
    for (const actor of [winner, buyer, loser, moderator]) {
      const json = await inbox(actor);
      expect(JSON.stringify(json)).not.toContain(kickoff.contact);
      expect(JSON.stringify(json)).not.toContain("Private kickoff marker");
      expect(json.notifications.filter((item) => item.type === "lead_kickoff" && item.entityId === lead.id)).toHaveLength(actor === winner ? 1 : 0);
    }
  });

  it("acknowledges once for the confirmed winner and does not change the public Awarded status", async () => {
    // This was already awarded when migration 0013 ran, with no invented award date.
    const { rows: [lead] } = await pool.query<Listing>("select id, slug from leads where slug = 'kickoff-upgrade-award'");
    fixtureIds.push(lead.id);
    expect(await markup(leadPath(lead), buyer)).toContain("Waiting for details");
    await read(sendDetails(lead.id, buyer), 201);
    for (const actor of [buyer, loser, moderator]) expect(await read(ack(lead.id, actor), 403)).toMatchObject({ code: "forbidden" });
    expect(await read(ack(lead.id), 401)).toMatchObject({ code: "unauthenticated" });
    expect(await read(send(kickoffPath(lead.id), winner, "PATCH", { action: "acknowledge" }, "https://another-origin.invalid"), 403)).toMatchObject({ code: "invalid_origin" });
    await pool.query("update users set is_banned = true where id = $1", [winner.id]);
    expect(await read(ack(lead.id, winner), 403)).toMatchObject({ code: "restricted" });
    expect(await markup(leadPath(lead), winner)).not.toContain(kickoff.contact);
    await pool.query("update users set is_banned = false where id = $1", [winner.id]);
    expect(await Promise.all([read(ack(lead.id, winner)), read(ack(lead.id, winner))])).toEqual([{ state: "acknowledged" }, { state: "acknowledged" }]);
    const [after] = await row(lead.id);
    expect(after.acknowledged_at).toBeInstanceOf(Date);
    await read(ack(lead.id, winner));
    expect(await row(lead.id)).toEqual([after]);
    expect((await notices(lead.id)).map(({ user_id, actor_id }) => ({ user_id, actor_id }))).toEqual([
      { user_id: winner.id, actor_id: buyer.id }, { user_id: buyer.id, actor_id: winner.id },
    ]);
    expect((await inbox(buyer)).notifications).toEqual(expect.arrayContaining([expect.objectContaining({ type: "lead_kickoff", href: `${leadPath(lead)}#kickoff` })]));
    const state = (await pool.query("select status, awarded_at, completed_at from leads where id = $1", [lead.id])).rows;
    expect(state).toEqual([{ status: "awarded", awarded_at: null, completed_at: null }]);
    for (const actor of [buyer, winner]) expect(await markup(leadPath(lead), actor)).toContain("Kickoff acknowledged. The lead is still Awarded.");
  });

  it("rejects private, ended, self, or inconsistent awards and cannot transfer a note to a different bid", async () => {
    const hidden = [await awarded({ publication: "pending_review" }), await awarded({ spaceId: privateSpace }), await awarded({ removed: true })];
    const missing = await read(sendDetails(2_147_000_000, buyer), 404);
    for (const lead of hidden) {
      expect(await read(sendDetails(lead.id, buyer), 404)).toEqual(missing);
      expect(await read(ack(lead.id, winner), 404)).toEqual(missing);
    }
    const cancelled = await awarded({ status: "cancelled" });
    const unaccepted = await awarded();
    const mismatch = await awarded();
    const disputed = await awarded();
    const self = await awarded({}, buyer.id);
    await pool.query("update lead_bids set is_accepted = false where id = $1", [unaccepted.bidId]);
    await pool.query("update leads set accepted_bid_id = $1 where id = $2", [cancelled.bidId, mismatch.id]);
    await pool.query("update leads set award_needs_review = true where id = $1", [disputed.id]);
    for (const lead of [cancelled, unaccepted, mismatch, disputed, self]) {
      expect(await read(sendDetails(lead.id, buyer), 409)).toMatchObject({ code: "kickoff_unavailable" });
      expect(await markup(leadPath(lead), buyer)).not.toContain('id="kickoff"');
    }

    const lead = await awarded();
    await read(sendDetails(lead.id, buyer), 201);
    // No reassignment route: simulate an operator repairing an award, not an app action.
    await pool.query("update lead_bids set is_accepted = false where id = $1", [lead.bidId]);
    const { rows: [nextBid] } = await pool.query("insert into lead_bids (lead_id, user_id, amount, message, is_accepted) values ($1, $2, 450, 'Replacement fixture bid', true) returning id", [lead.id, loser.id]);
    await pool.query("update leads set accepted_bid_id = $1, assigned_user_id = $2 where id = $3", [nextBid.id, loser.id, lead.id]);
    for (const actor of [winner, loser, buyer]) expect(await markup(leadPath(lead), actor)).not.toContain(kickoff.contact);
    expect((await inbox(winner)).notifications.some((item) => item.type === "lead_kickoff" && item.entityId === lead.id)).toBe(false);
    expect(await read(ack(lead.id, loser), 409)).toMatchObject({ code: "kickoff_missing" });
    expect(await read(ack(lead.id, winner), 403)).toMatchObject({ code: "forbidden" });
    expect(await read(sendDetails(lead.id, buyer), 409)).toMatchObject({ code: "kickoff_exists" });
  });

  it("validates content and JSON bounds without writing a note or exposing moderation evidence", async () => {
    const lead = await awarded();
    expect(await read(sendDetails(lead.id, buyer, { ...kickoff, winnerId: loser.id }), 422)).toMatchObject({ code: "invalid_kickoff" });
    expect(await read(sendDetails(lead.id, buyer, { ...kickoff, startDate: "2028-02-30" }), 422)).toMatchObject({ fields: { startDate: expect.any(String) } });
    expect(await read(sendDetails(lead.id, buyer, { ...kickoff, contact: "x".repeat(201) }), 422)).toMatchObject({ fields: { contact: expect.any(String) } });
    expect(await read(sendDetails(lead.id, buyer, { ...kickoff, note: " ".repeat(20_000) + kickoff.note }), 413)).toMatchObject({ code: "body_too_large" });
    expect(await read(sendDetails(lead.id, buyer, { ...kickoff, note: "Guaranteed income if you wire transfer upfront." }), 422)).toMatchObject({ code: "filtered" });
    expect(await read(send(kickoffPath(lead.id), winner, "PATCH", { action: "start" }), 422)).toMatchObject({ fields: { action: expect.any(String) } });
    await expectErased(lead.id);
    expect((await pool.query("select id from reports where target_type = 'lead' and target_id = $1", [lead.id])).rowCount).toBe(0);
  });

  it("erases details and kickoff notices on completion, cancellation, or lead removal", async () => {
    const completed = await awarded();
    await read(sendDetails(completed.id, buyer), 201);
    await read(ack(completed.id, winner));
    expect(await read(outcome(completed.id, buyer, "complete"))).toMatchObject({ status: "completed" });
    await expectErased(completed.id);
    const completeHtml = await markup(leadPath(completed), buyer);
    expect(completeHtml).not.toContain(kickoff.contact);
    expect(completeHtml).not.toContain('id="kickoff"');
    expect(completeHtml).toContain("Leave a review");
    expect(await read(ack(completed.id, winner), 409)).toMatchObject({ code: "kickoff_unavailable" });
    const cancelled = await awarded();
    const [submission, cancellation] = await Promise.all([sendDetails(cancelled.id, buyer), outcome(cancelled.id, buyer, "cancel")]);
    expect([201, 409]).toContain(submission.status);
    expect(cancellation.status).toBe(200);
    await expectErased(cancelled.id);
    expect(await markup(leadPath(cancelled), winner)).not.toContain('id="kickoff"');
    const removed = await awarded();
    await read(sendDetails(removed.id, buyer), 201);
    const { id: reportId } = await read<{ id: number }>(send("/api/reports", observer, "POST", { targetType: "lead", targetId: removed.id, reason: "off_topic" }), 201);
    await read(send(`/api/mod/reports/${reportId}`, moderator, "PATCH", { action: "approve" }));
    await expectErased(removed.id);
    expect((await send(leadPath(removed), winner)).status).toBe(404);
    expect(await markup(leadPath(removed), moderator)).not.toContain(kickoff.contact);
    expect(await read(sendDetails(removed.id, buyer), 404)).toMatchObject({ code: "not_found" });
  });
});
