import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PublicLeadReviewsPage } from "../lead-reviews";
import type { ReviewResult } from "../lead-review-input";

const origin = process.env.BORYNX_REVIEWS_TEST_ORIGIN;
const databaseUrl = process.env.BORYNX_REVIEWS_TEST_DATABASE_URL;
const enabled = Boolean(origin && databaseUrl && URL.canParse(origin) && URL.canParse(databaseUrl) && new URL(origin).hostname === "127.0.0.1" &&
  new URL(databaseUrl).hostname === "127.0.0.1" && new URL(databaseUrl).pathname === "/borynx_demo_lead_reviews");
const pitchMessage = "Private pitch marker: I will keyboard-test each checkout step and include a prioritized report.";
const scope = "Private-to-this-page scope marker: document a checkout usability audit.";
const publishedText = "They delivered a clear report, with <em>specific</em> recommendations.";
const heldText = "The reply said no interview needed before the review of the checkout flow.";

type Actor = { id: number; username: string; token: string };
type Listing = { id: number; slug: string };
type FixtureOptions = { authorId?: number; spaceId?: number; status?: string; publication?: string; removed?: boolean };

function send(path: string, actor?: Actor, method = "GET", body?: unknown, from = origin) {
  const headers = new Headers();
  if (from && method !== "GET") headers.set("Origin", from);
  if (actor) headers.set("x-bx-session", actor.token);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return fetch(`${origin}${path}`, { method, headers, redirect: "manual", body: body === undefined ? undefined : JSON.stringify(body) });
}

async function read<T = unknown>(request: Promise<Response>, status = 200): Promise<T> {
  const res = await request;
  expect(res.status, `${res.url}: ${res.status === status ? "" : await res.clone().text()}`).toBe(status);
  expect(res.headers.get("cache-control")).toContain("no-store");
  return res.json() as Promise<T>;
}

async function login(username: string): Promise<Actor> {
  const res = await send("/api/auth/login", undefined, "POST", { username });
  expect(res.status).toBe(200);
  const { user, token } = await res.json();
  return { id: user.id, username, token };
}

async function markup(path: string, actor?: Actor) {
  const response = await send(path, actor);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  return (await response.text()).replaceAll("<!-- -->", "");
}

const leadPath = ({ id, slug }: Listing) => `/l/${id}/${slug}`;
const submitPath = (id: number) => `/api/leads/${id}/review`;
const profilePath = (username: string) => `/f/${username}?tab=reviews`;
const apiPath = (username: string) => `/api/users/${username}/reviews`;
const submit = (id: number, actor: Actor | undefined, rating = 5, testimonial = publishedText) => send(submitPath(id), actor, "POST", { rating, testimonial });
const decide = (id: number, actor: Actor, action: string, reason = "Reviewed the content and award evidence.") => send(`/api/mod/lead-reviews/${id}`, actor, "PATCH", { action, reason });
const reportReview = (id: number, actor: Actor, details = "") => send("/api/reports", actor, "POST", { targetType: "lead_review", targetId: id, reason: "off_topic", details });
const decideReport = (id: number, actor: Actor, action: string) => send(`/api/mod/reports/${id}`, actor, "PATCH", { action });
const empty = { items: [], count: 0, buyerCount: 0, averageRating: null, nextCursor: null };

// Run only from the disposable Phase 6 runner; fixture cleanup deliberately writes directly to that DB.
describe.skipIf(!enabled)("verified engagement reviews on disposable PostgreSQL", () => {
  let pool: Pool;
  let buyer: Actor;
  let winner: Actor;
  let otherBidder: Actor;
  let moderator: Actor;
  let observer: Actor;
  let space: number;
  let privateSpace: number;
  const fixtureIds: number[] = [];

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
    [buyer, winner, otherBidder, moderator, observer] = await Promise.all(
      ["demo-buyer", "demo-bidder-a", "demo-bidder-b", "demo-reviewer", "demo-observer"].map(login),
    );
    await pool.query("update users set company_name = 'Private reviewer company marker', company_name_public = false where id = $1", [buyer.id]);
    const { rows } = await pool.query("insert into spaces (slug, name, privacy) values ('review-space-fixture', 'Review Space', 'public'), ('review-private-fixture', 'Private Review Space', 'private') returning id");
    [space, privateSpace] = rows.map((row) => row.id);
    await pool.query("insert into memberships (user_id, space_id, mod_role) values ($1, $2, 'moderator')", [observer.id, space]);
    // Reserve room to deliberately create same-ID lead and comment fixtures without sequence conflicts.
    await pool.query("select setval('borynx_private.lead_reviews_id_seq', 1000000)");
  });
  afterEach(async () => {
    await pool.query("delete from reports where target_type = 'lead_review' or (target_type = 'lead' and target_id = any($1::int[]))", [fixtureIds]);
    await pool.query("delete from leads where id = any($1::int[])", [fixtureIds.splice(0)]);
    await pool.query("update users set is_banned = false where id = any($1::int[])", [[buyer.id, moderator.id]]);
  });
  afterAll(async () => { await pool?.end(); });

  async function fixture(options: FixtureOptions = {}) {
    const { authorId = buyer.id, spaceId = space, status = "open", publication = "published", removed = false } = options;
    const { rows: [row] } = await pool.query<Listing>(`insert into leads
      (author_id, space_id, slug, title, description, category, budget_max, status, publication_status, is_removed)
      values ($1, $2, $3, 'Distinct review test fixture', $4, 'Software Engineering', 8301, $5, $6, $7) returning id, slug`,
    [authorId, spaceId, `review-test-${randomUUID()}`, scope, status, publication, removed]);
    fixtureIds.push(row.id);
    return row;
  }

  async function completed(options?: FixtureOptions, recipient = winner.id) {
    const lead = await fixture({ status: "completed", ...options });
    const { rows: [bid] } = await pool.query<{ id: number }>(`insert into lead_bids (lead_id, user_id, amount, message, is_accepted)
      values ($1, $2, 197, $3, true) returning id`, [lead.id, recipient, pitchMessage]);
    await pool.query("update leads set assigned_user_id = $1, accepted_bid_id = $2, completed_at = now() where id = $3", [recipient, bid.id, lead.id]);
    return { ...lead, bidId: bid.id };
  }

  async function checkProfile(count: number, buyerCount: number, average: number | null, ...suppressedText: string[]) {
    const [json, html] = await Promise.all([read<PublicLeadReviewsPage>(send(apiPath(winner.username))), markup(profilePath(winner.username))]);
    expect(json.count).toBe(count);
    expect(json.buyerCount).toBe(buyerCount);
    expect(json.averageRating).toBe(average);
    const region = html.match(/<section id="profile-reviews"[^>]*>([\s\S]*?)<\/section>/)?.[1];
    expect(region).toContain(`<span class="num">${count}</span> ${count === 1 ? "review" : "reviews"}`);
    expect(region).toContain(`<span class="num">${buyerCount}</span> ${buyerCount === 1 ? "buyer account" : "buyer accounts"}`);
    if (average === null) expect(region).not.toContain('text-[20px] font-semibold');
    else expect(region).toContain(`${average.toFixed(1)} / 5`);
    for (const text of suppressedText) {
      expect(region).not.toContain(text);
      expect(JSON.stringify(json)).not.toContain(text);
    }
    return { json, region };
  }

  it("suggests patterns only to site staff without holding reviews or making moderation decisions", async () => {
    const original = "They documented the full checkout flow and shared a prioritized accessibility report with clear steps to verify each fix.";
    const first = await completed();
    const second = await completed({ authorId: otherBidder.id });
    const reverse = await completed({ authorId: winner.id }, buyer.id);
    const privateLead = await completed({ spaceId: privateSpace });
    const removed = await completed({ removed: true });
    const inconsistent = await completed();
    const dated = await completed();
    const sampled = [first.id, second.id, reverse.id, privateLead.id, removed.id, inconsistent.id];
    await pool.query("update leads set awarded_at=now()-interval '1 hour' where id=any($1::int[])", [sampled]);
    await pool.query("update leads set award_needs_review=true where id=$1", [inconsistent.id]);
    await pool.query("update leads set awarded_at=now()-interval '120 days', completed_at=now()-interval '120 days'+interval '1 hour' where id=$1", [dated.id]);
    const [a, b] = await Promise.all([
      read<ReviewResult>(submit(first.id, buyer, 5, original), 201),
      read<ReviewResult>(submit(second.id, otherBidder, 4, original.replace("full checkout", "whole checkout")), 201),
    ]);
    expect(a.visibility).toBe("published");
    expect(b.visibility).toBe("published");
    const regionFrom = (html: string) => html.match(/<section aria-labelledby="engagement-signals-heading"[^>]*>([\s\S]*?)<\/section>/)?.[1];
    const queue = await markup("/mod/queue", moderator);
    const region = regionFrom(queue);
    expect(region).toContain("Advisory only, not evidence of misconduct");
    expect(region).toContain("Buyer marked complete within 24 hours of award");
    expect(region).toContain("Reciprocal award with");
    expect(region).toMatch(new RegExp(`Similar testimonial to review #(${a.id}|${b.id})`));
    for (const id of [first.id, second.id, reverse.id]) expect(region).toContain(`Lead #${id}<`);
    for (const id of [privateLead.id, removed.id, inconsistent.id, dated.id]) expect(region).not.toContain(`Lead #${id}<`);
    expect(region).not.toContain(original);
    expect(region).not.toContain(pitchMessage);
    for (const actor of [undefined, buyer, observer]) {
      const response = await send("/mod/queue", actor);
      expect(response.status).toBe(307);
      expect(await response.text()).not.toContain("engagement-signals-heading");
    }
    await pool.query("update users set is_banned = true where id=$1", [moderator.id]);
    expect((await send("/mod/queue", moderator)).status).toBe(307);
    const { json, region: publicRegion } = await checkProfile(2, 2, null);
    expect(json.items.map((item) => item.id).sort()).toEqual([a.id, b.id].sort());
    expect(json).not.toHaveProperty("signals");
    expect(publicRegion).not.toContain("Similar testimonial");
    expect((await pool.query("select id from reports where target_type = 'lead_review' and target_id=any($1::int[])", [[a.id, b.id]])).rowCount).toBe(0);
    expect((await pool.query("select id from borynx_private.lead_review_decisions where review_id=any($1::int[])", [[a.id, b.id]])).rowCount).toBe(0);
    await pool.query("update users set is_banned = false where id=$1", [moderator.id]);
    await pool.query("update leads set is_removed = true where id=$1", [first.id]);
    const updated = regionFrom(await markup("/mod/queue", moderator));
    expect(updated).not.toContain("Similar testimonial");
    expect(updated).not.toContain("Reciprocal award with");
  });

  it("shows the form only after an actual buyer completes a matching award, and inserts exactly one review under concurrency", async () => {
    const lead = await fixture();
    const { id } = lead;
    expect(await read(submit(id, buyer), 409)).toMatchObject({ code: "review_ineligible" });
    const { id: bidId } = await read<{ id: number }>(send(`/api/leads/${id}/bids`, winner, "POST", { amount: 197, message: pitchMessage }), 201);
    await read(send(`/api/leads/${id}/bids`, otherBidder, "POST", { amount: 120, message: "A losing pitch about reporting on checkout usability." }), 201);
    await read(send(`/api/leads/${id}/bids/${bidId}/accept`, buyer, "POST"));
    expect(await markup(leadPath(lead), buyer)).not.toContain("Leave a review");
    expect(await read(submit(id, buyer), 409)).toMatchObject({ code: "review_ineligible" });
    await read(send(`/api/leads/${id}/status`, buyer, "PATCH", { action: "complete" }));

    const visibleToBuyer = await markup(leadPath(lead), buyer);
    expect(visibleToBuyer).toContain("Leave a review");
    expect(visibleToBuyer.match(/type="radio"/g)).toHaveLength(5);
    for (const actor of [winner, otherBidder, observer, moderator, undefined]) {
      expect(await markup(leadPath(lead), actor)).not.toContain("Leave a review");
      expect(await read(submit(id, actor), actor ? 403 : 401)).toMatchObject({ code: actor ? "forbidden" : "unauthenticated" });
    }
    await pool.query("update users set is_banned = true where id = $1", [buyer.id]);
    expect(await markup(leadPath(lead), buyer)).not.toContain("Leave a review");
    expect(await read(submit(id, buyer), 403)).toMatchObject({ code: "restricted" });
    await pool.query("update users set is_banned = false where id = $1", [buyer.id]);
    expect(await read(send(submitPath(id), buyer, "POST", { rating: 5, testimonial: publishedText }, "https://elsewhere.invalid"), 403)).toMatchObject({ code: "invalid_origin" });
    for (const rating of [0, 6, 1.5, "5", null]) {
      expect(await read(send(submitPath(id), buyer, "POST", { rating, testimonial: publishedText }), 422)).toMatchObject({ fields: { rating: expect.any(String) } });
    }
    expect(await read(submit(id, buyer, 5, "   too short   "), 422)).toMatchObject({ fields: { testimonial: expect.any(String) } });
    expect(await read(send(submitPath(id), buyer, "POST", { rating: 5, testimonial: publishedText, recipientId: otherBidder.id }), 422)).toMatchObject({ code: "invalid_review" });
    const karmaBefore = (await pool.query("select karma from users where id = any($1::int[]) order by id", [[winner.id, buyer.id]])).rows;
    const competing = await Promise.all([submit(id, buyer, 4, `  ${publishedText}\n`), submit(id, buyer, 4, publishedText)]);
    expect(competing.map((r) => r.status).sort()).toEqual([201, 409]);
    const result = await read<ReviewResult>(Promise.resolve(competing.find((r) => r.status === 201)!), 201);
    expect(result).toEqual({ id: expect.any(Number), visibility: "published" });
    expect(await competing.find((r) => r.status === 409)!.json()).toMatchObject({ code: "review_exists" });
    expect((await pool.query("select id, reviewer_id, recipient_id, rating, testimonial from borynx_private.lead_reviews where lead_id = $1", [id])).rows).toEqual([
      { id: result.id, reviewer_id: buyer.id, recipient_id: winner.id, rating: 4, testimonial: publishedText },
    ]);
    expect((await pool.query("select karma from users where id = any($1::int[]) order by id", [[winner.id, buyer.id]])).rows).toEqual(karmaBefore);
    const { json, region } = await checkProfile(1, 1, null, pitchMessage, scope, "8301", "Private reviewer company marker", leadPath(lead));
    expect(json.items).toEqual([{ id: result.id, rating: 4, testimonial: publishedText, createdAt: expect.any(String), reviewer: { username: buyer.username, displayName: "Demo Buyer" } }]);
    expect(region).toContain("Buyer marked this lead complete");
    expect(region).toContain("&lt;em&gt;specific&lt;/em&gt;");
    expect(region).not.toContain("<em>specific</em>");
    expect(await markup(leadPath(lead), buyer)).toContain("Review published on");
    expect(await read(send(apiPath(otherBidder.username)))).toEqual(empty);
  });

  it("rejects missing completion, legacy, cancelled, self, and inconsistent awards; conceals nonpublic leads", async () => {
    const closed = await completed({ status: "closed" });
    const cancelled = await completed({ status: "cancelled" });
    const noWinner = await fixture({ status: "completed" });
    const noTime = await completed();
    const wrongLead = await completed();
    const wrongUser = await completed();
    const unaccepted = await completed();
    const disputed = await completed();
    const self = await completed({}, buyer.id);
    await pool.query("update leads set completed_at = null where id = $1", [noTime.id]);
    await pool.query("update leads set completed_at = now() where id = $1", [noWinner.id]);
    await pool.query("update leads set accepted_bid_id = $1 where id = $2", [closed.bidId, wrongLead.id]);
    await pool.query("update leads set assigned_user_id = $1 where id = $2", [otherBidder.id, wrongUser.id]);
    await pool.query("update lead_bids set is_accepted = false where id = $1", [unaccepted.bidId]);
    await pool.query("update leads set award_needs_review = true where id = $1", [disputed.id]);
    for (const lead of [closed, cancelled, noWinner, noTime, wrongLead, wrongUser, unaccepted, disputed, self]) {
      expect(await read(submit(lead.id, buyer), 409)).toMatchObject({ code: "review_ineligible" });
      expect(await markup(leadPath(lead), buyer)).not.toContain("Leave a review");
    }
    const hidden = [await completed({ publication: "pending_review" }), await completed({ spaceId: privateSpace }), await completed({ removed: true })];
    const missing = await read(submit(2_147_000_000, buyer), 404);
    for (const lead of hidden) {
      expect(await read(submit(lead.id, buyer), 404)).toEqual(missing);
      expect(await read(submit(lead.id, moderator), 404)).toEqual(missing);
    }
    expect((await pool.query("select id from borynx_private.lead_reviews where lead_id = any($1::int[])", [fixtureIds])).rowCount).toBe(0);
    expect(await read(send(apiPath(winner.username)))).toEqual(empty);
  });

  it("holds screened reviews, scopes staff decisions, and updates the profile count and average in lockstep with the API", async () => {
    const visible = await completed();
    const pending = await completed();
    const blocked = await completed();
    await read(submit(visible.id, buyer, 5, "A thorough and professional review of the design."), 201);
    expect(await read(submit(blocked.id, buyer, 2, "They said no interview needed with guaranteed income."), 422)).toMatchObject({ code: "filtered" });
    const { id } = await read<ReviewResult>(submit(pending.id, buyer, 1, heldText), 201);
    expect((await pool.query("select visibility from borynx_private.lead_reviews where id = $1", [id])).rows).toEqual([{ visibility: "pending_review" }]);
    expect((await pool.query("select id from borynx_private.lead_reviews where lead_id = $1", [blocked.id])).rowCount).toBe(0);
    expect(await markup(leadPath(pending), buyer)).toContain("It won’t appear on the winner’s profile until a moderator publishes it.");
    await checkProfile(1, 1, null, heldText);
    for (const actor of [buyer, winner, moderator]) expect(await markup(profilePath(winner.username), actor)).not.toContain(heldText);
    const staffPage = await markup("/mod/queue", moderator);
    expect(staffPage).toContain(heldText);
    expect(staffPage).toContain("Publish review");
    expect(staffPage).not.toContain(pitchMessage);
    expect((await send("/mod/queue", observer)).status).toBe(307);
    expect(await read(reportReview(id, observer), 404)).toMatchObject({ code: "not_found" });

    const { rows: [auto] } = await pool.query("select id, space_id, details from reports where target_type = 'lead_review' and target_id = $1 and reason = 'automated_filter'", [id]);
    expect(auto).toMatchObject({ space_id: null, details: "Auto-filter: scam_phrase" });
    // Defense in depth: even a legacy or mislinked review report cannot enter a space queue.
    await pool.query("update reports set space_id = $1, details = 'private review evidence canary' where id = $2", [space, auto.id]);
    for (const actor of [observer, moderator]) {
      const local = await markup("/b/review-space-fixture/mod", actor);
      expect(local).not.toContain(heldText);
      expect(local).not.toContain("private review evidence canary");
    }
    expect(await read(decide(id, observer, "publish"), 403)).toMatchObject({ code: "forbidden" });
    expect(await read(decideReport(auto.id, observer, "approve"), 404)).toMatchObject({ error: "Report not found" });
    expect(await read(decide(id, moderator, "restore"), 409)).toMatchObject({ code: "review_conflict" });
    expect(await read(decide(id, moderator, "publish", "  "), 422)).toMatchObject({ fields: { reason: expect.any(String) } });
    await pool.query("update users set is_banned = true where id = $1", [moderator.id]);
    expect(await read(decide(id, moderator, "publish"), 403)).toMatchObject({ code: "restricted" });
    await pool.query("update users set is_banned = false where id = $1", [moderator.id]);
    expect(await read(decideReport(auto.id, moderator, "dismiss"))).toEqual({ ok: true, status: "dismissed" });
    await checkProfile(1, 1, null, heldText);
    expect(await read(decide(id, moderator, "publish", "Accept after reading the context."))).toEqual({ id, visibility: "published" });
    expect((await checkProfile(2, 1, null, "Accept after reading the context.")).region).toContain(heldText);
    expect(await read(decide(id, moderator, "hide", "Hide this review pending staff follow-up."))).toEqual({ id, visibility: "hidden" });
    expect(await markup(leadPath(pending), buyer)).toContain("Your review is hidden");
    await checkProfile(1, 1, null, heldText, "Hide this review pending staff follow-up.");
    expect(await read(submit(pending.id, buyer, 4, heldText), 409)).toMatchObject({ code: "review_exists" });
    expect(await read(reportReview(id, observer), 404)).toMatchObject({ code: "not_found" });
    expect(await read(decide(id, moderator, "restore", "Restore after additional review."))).toEqual({ id, visibility: "published" });
    await checkProfile(2, 1, null, "Restore after additional review.");
    expect((await pool.query("select action, moderator_id, reason from borynx_private.lead_review_decisions where review_id = $1 order by id", [id])).rows).toEqual([
      { action: "publish", moderator_id: moderator.id, reason: "Accept after reading the context." },
      { action: "hide", moderator_id: moderator.id, reason: "Hide this review pending staff follow-up." },
      { action: "restore", moderator_id: moderator.id, reason: "Restore after additional review." },
    ]);
  });

  it("approves review reports without touching either lead or comment at the same numeric ID, and excludes an ineligible engagement", async () => {
    const lead = await completed();
    const testimonial = "An independent testimonial about delivered work.";
    const { id } = await read<ReviewResult>(submit(lead.id, buyer, 4, testimonial), 201);
    const { rows: [post] } = await pool.query(`insert into posts (space_id, author_id, title, slug, body)
      values ($1, $2, 'Do not act on this thread', 'report-collision', 'This is the parent of an unrelated comment.') returning id`, [space, observer.id]);
    await pool.query("insert into comments (id, post_id, author_id, body) values ($1, $2, $3, 'Unrelated comment with a colliding ID')", [id, post.id, observer.id]);
    await pool.query(`insert into leads (id, author_id, slug, title, description, category, publication_status)
      values ($1, $2, 'colliding-lead', 'Unrelated lead with a colliding ID', 'No relationship to the report.', 'Software Engineering', 'published')`, [id, observer.id]);
    fixtureIds.push(id);
    const { rows: [commentCase] } = await pool.query("insert into reports (target_type, target_id, reason, space_id) values ('comment', $1, 'off_topic', $2) returning id", [id, space]);
    const { id: reportId } = await read<{ id: number }>(reportReview(id, observer, "Check only the testimonial."), 201);
    expect(await read(decideReport(reportId, moderator, "approve"))).toEqual({ ok: true, status: "approved" });
    expect((await pool.query("select id, is_removed from leads where id = any($1::int[]) order by id", [[lead.id, id]])).rows).toEqual([
      { id: lead.id, is_removed: false }, { id, is_removed: false },
    ]);
    expect((await pool.query("select is_removed from comments where id = $1", [id])).rows).toEqual([{ is_removed: false }]);
    expect((await pool.query("select status from reports where id = $1", [commentCase.id])).rows).toEqual([{ status: "pending" }]);
    expect((await pool.query("select action, reason from borynx_private.lead_review_decisions where review_id = $1", [id])).rows).toEqual([
      { action: "hide", reason: `Report #${reportId}: off_topic` },
    ]);
    await checkProfile(0, 0, null, testimonial);
    await read(decide(id, moderator, "restore"));
    await checkProfile(1, 1, null);
    await pool.query("update leads set space_id = $1 where id = $2", [privateSpace, lead.id]);
    await checkProfile(0, 0, null, testimonial);
    expect(await read(reportReview(id, moderator), 404)).toMatchObject({ code: "not_found" });
    await pool.query("update leads set space_id = $1 where id = $2", [space, lead.id]);
    await pool.query("update lead_bids set is_accepted = false where id = $1", [lead.bidId]);
    await checkProfile(0, 0, null, testimonial);
    await pool.query("update lead_bids set is_accepted = true where id = $1", [lead.bidId]);
    const leadReport = await read<{ id: number }>(send("/api/reports", observer, "POST", { targetType: "lead", targetId: lead.id, reason: "off_topic" }), 201);
    await read(decideReport(leadReport.id, moderator, "approve"));
    expect((await pool.query("select is_removed from leads where id = $1", [lead.id])).rows).toEqual([{ is_removed: true }]);
    expect((await pool.query("select visibility from borynx_private.lead_reviews where id = $1", [id])).rows).toEqual([{ visibility: "published" }]);
    await checkProfile(0, 0, null, testimonial);
    expect(await read(reportReview(id, buyer), 404)).toMatchObject({ code: "not_found" });
    await read(decide(id, moderator, "hide"));
    expect(await read(decide(id, moderator, "restore"), 409)).toMatchObject({ code: "review_ineligible" });
    await pool.query("delete from leads where id = $1", [lead.id]);
    expect((await pool.query("select id from borynx_private.lead_reviews where id = $1", [id])).rowCount).toBe(0);
    expect((await pool.query("select id from borynx_private.lead_review_decisions where review_id = $1", [id])).rowCount).toBe(0);
    await pool.query("delete from posts where id = $1", [post.id]);
    await pool.query("delete from reports where id = $1", [commentCase.id]);
  });

  it("allows a staff member who was the buyer to submit but not to moderate that review", async () => {
    const lead = await completed({ authorId: moderator.id });
    expect(await markup(leadPath(lead), moderator)).toContain("Leave a review");
    const { id } = await read<ReviewResult>(submit(lead.id, moderator), 201);
    expect(await read(decide(id, moderator, "hide"), 403)).toMatchObject({ code: "forbidden" });
    const { id: reportId } = await read<{ id: number }>(reportReview(id, observer), 201);
    expect(await read(decideReport(reportId, moderator, "approve"), 403)).toMatchObject({ code: "forbidden" });
    expect(await markup(profilePath(winner.username), moderator)).not.toContain("Hide review");
    await checkProfile(1, 1, null);
  });

  it("weights only the latest eligible review from each buyer and waits for three distinct accounts", async () => {
    const leadA = await completed();
    const repeat = await completed();
    const leadB = await completed({ authorId: observer.id });
    const leadC = await completed({ authorId: otherBidder.id });
    const old = await read<ReviewResult>(submit(leadA.id, buyer, 4), 201);
    const latest = await read<ReviewResult>(submit(repeat.id, buyer, 1), 201);
    // Make identical timestamps intentional; the higher review ID is the newer review in this tie.
    await pool.query("update borynx_private.lead_reviews set created_at = '2025-04-01T10:12:00.000010Z' where id in ($1,$2)", [old.id, latest.id]);
    await read(submit(leadB.id, observer, 2), 201);
    await checkProfile(3, 2, null);
    expect(await read(submit(leadC.id, otherBidder, 3), 201)).toMatchObject({ visibility: "published" });
    const { json } = await checkProfile(4, 3, 2);
    expect(json.items.map((item) => item.id)).toContain(old.id);
    expect(json.items.map((item) => item.id)).toContain(latest.id);
    await read(decide(latest.id, moderator, "hide"));
    await checkProfile(3, 3, 3); // The same buyer now contributes their older eligible 4, not two votes.
    await pool.query("update leads set is_removed = true where id = $1", [leadC.id]);
    await checkProfile(2, 2, null);
  });

  it("uses exact keyset paging with unchanged aggregate totals and keeps alias navigation on Reviews", async () => {
    async function dated(label: string, time: string) {
      const lead = await completed();
      const { rows: [review] } = await pool.query<{ id: number; testimonial: string }>(`insert into borynx_private.lead_reviews
        (lead_id, reviewer_id, recipient_id, rating, testimonial, visibility, created_at) values ($1, $2, $3, 4, $4, 'published', $5)
        returning id, testimonial`, [lead.id, buyer.id, winner.id, `The completed engagement testimonial ${label}.`, time]);
      return review;
    }
    const ties = [];
    for (let i = 0; i < 10; i++) ties.push(await dated(`tie-${i}`, "2025-01-01T00:00:00.000010Z"));
    const older = await dated("older-by-one-microsecond", "2025-01-01T00:00:00.000009Z");
    const newer = await dated("newer-by-one-microsecond", "2025-01-01T00:00:00.000011Z");
    const first = await read<PublicLeadReviewsPage>(send(apiPath(winner.username)));
    expect(first.items.map((r) => r.id)).toEqual([newer, ...ties.slice(1).reverse()].map((r) => r.id));
    expect(first.nextCursor).toBe(`2025-01-01T00:00:00.000010Z:${ties[1].id}`);
    expect(first.count).toBe(12);
    const firstHtml = await markup(profilePath(winner.username));
    expect(firstHtml).toContain(newer.testimonial);
    expect(firstHtml).not.toContain(older.testimonial);
    expect(firstHtml).toContain("Older reviews");
    await dated("arrival-after-page-one", "2026-01-01T00:00:00.000000Z");
    const query = `&cursor=${encodeURIComponent(first.nextCursor!)}`;
    const second = await read<PublicLeadReviewsPage>(send(`${apiPath(winner.username)}?${query.slice(1)}`));
    expect(second.items.map((r) => r.id)).toEqual([ties[0].id, older.id]);
    expect(second).toMatchObject({ count: 13, buyerCount: 1, averageRating: null, nextCursor: null });
    const secondHtml = await markup(`${profilePath(winner.username)}${query}`);
    expect(secondHtml).toContain(older.testimonial);
    expect(secondHtml).not.toContain(newer.testimonial);
    expect(secondHtml).toContain("Newest reviews");
    await pool.query("insert into user_aliases (user_id, alias) values ($1, 'old-review-handle')", [winner.id]);
    const alias = await send(`${profilePath("old-review-handle")}${query}`);
    expect(alias.status).toBe(308);
    expect(alias.headers.get("location")).toBe(`${profilePath(winner.username)}${query}`);
    expect(await read(send(`${apiPath("old-review-handle")}?${query.slice(1)}`))).toEqual(second);
    expect(await read(send(`${apiPath(winner.username)}?cursor=not-a-cursor`), 400)).toMatchObject({ code: "invalid_cursor" });
    expect(await read(send(`${apiPath(winner.username)}?cursor=one&cursor=two`), 400)).toMatchObject({ code: "invalid_cursor" });
    expect(await markup(`${profilePath(winner.username)}&cursor=bogus`)).toContain("That page link was invalid");
    expect(await read(send(apiPath("not-a-real-review-profile")), 404)).toMatchObject({ code: "not_found" });
  });
});
