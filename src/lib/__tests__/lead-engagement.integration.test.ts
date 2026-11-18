import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isDemoDatabaseUrl } from "../demo-mode";

const origin = process.env.BORYNX_ENGAGEMENT_TEST_ORIGIN;
const databaseUrl = process.env.BORYNX_ENGAGEMENT_TEST_DATABASE_URL;
const enabled = Boolean(origin && new URL(origin).hostname === "127.0.0.1" && isDemoDatabaseUrl(databaseUrl));

type Actor = { id: number; token: string };
type Listing = { id: number; slug: string };
const firstPitch = { amount: 71, message: "My private proposal is to audit keyboard focus across the five checkout steps and supply screenshots of fixes." };
const secondPitch = { amount: 89, message: "My private proposal covers screen reader testing and includes an ordered defect report with a recorded walkthrough." };

function request(path: string, actor?: Actor, method = "GET", body?: object) {
  const headers = new Headers();
  if (actor) headers.set("x-bx-session", actor.token);
  if (body) headers.set("Content-Type", "application/json");
  return fetch(`${origin}${path}`, { method, headers, redirect: "manual", body: body ? JSON.stringify(body) : undefined });
}

async function login(username: string): Promise<Actor> {
  const response = await request("/api/auth/login", undefined, "POST", { username });
  expect(response.status).toBe(200);
  const { user, token } = await response.json();
  return { id: user.id, token };
}

const sendPitch = (id: number, actor: Actor | undefined, body: object) => request(`/api/leads/${id}/bids`, actor, "POST", body);
const award = (id: number, bidId: number, actor?: Actor) => request(`/api/leads/${id}/bids/${bidId}/accept`, actor, "POST");
const outcome = (id: number, action: string, actor?: Actor) => request(`/api/leads/${id}/status`, actor, "PATCH", { action });
const permalink = (listing: Listing) => `/l/${listing.id}/${listing.slug}`;

describe.skipIf(!enabled)("lead engagement on disposable PostgreSQL", () => {
  let pool: Pool;
  let buyer: Actor;
  let bidderA: Actor;
  let bidderB: Actor;
  let reviewer: Actor;
  let observer: Actor;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
    [buyer, bidderA, bidderB, reviewer, observer] = await Promise.all([
      login("demo-buyer"), login("demo-bidder-a"), login("demo-bidder-b"), login("demo-reviewer"), login("demo-observer"),
    ]);
  });
  afterAll(async () => { await pool?.end(); });

  async function fixture(author: Actor, { status = "open", publication = "published" } = {}): Promise<Listing> {
    const { rows: [row] } = await pool.query<Listing>(`insert into leads (author_id, slug, title, description, category, publication_status, status)
      values ($1, $2, 'Fixture-only keyboard audit', 'Fixture scope for isolated engagement tests', 'Web & Mobile', $3, $4) returning id, slug`,
    [author.id, `fixture-${randomUUID()}`, publication, status]);
    return row;
  }

  async function makePitch(id: number, actor: Actor, body = firstPitch): Promise<number> {
    const response = await sendPitch(id, actor, body);
    expect(response.status).toBe(201);
    return (await response.json()).id as number;
  }

  it("publishes a brief, keeps two pitches private, awards once under concurrency, and records completion", async () => {
    const title = `Checkout workflow audit ${randomUUID().slice(0, 8)}`;
    const submission = await request("/api/leads", buyer, "POST", {
      title, description: "Review keyboard navigation in five checkout screens and deliver a prioritized report with example fixes and an annotated recording.",
      category: "Web & Mobile", kind: "contract", budgetMin: 50, budgetMax: 120, currency: "EUR", budgetUnit: "hourly",
      skillTags: ["accessibility"], submissionKey: randomUUID(), deadlineAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
    expect(submission.status).toBe(201);
    const { id, href } = await submission.json();
    expect((await sendPitch(id, bidderA, firstPitch)).status).toBe(404);
    expect((await request(`/api/mod/leads/${id}`, reviewer, "PATCH", { action: "publish", revision: 1 })).status).toBe(200);
    const redirected = await request(href);
    expect(redirected.status).toBe(308);
    const path = new URL(redirected.headers.get("location")!, origin).pathname;
    expect((await sendPitch(id, undefined, firstPitch)).status).toBe(401);
    expect((await sendPitch(id, buyer, firstPitch)).status).toBe(403);
    const badQuote = await sendPitch(id, bidderA, { ...firstPitch, amount: 71.25 });
    expect(badQuote.status).toBe(422);
    expect(await badQuote.json()).toMatchObject({ fields: { amount: expect.any(String) } });
    expect((await outcome(id, "complete", buyer)).status).toBe(409);

    const competingPitches = await Promise.all([sendPitch(id, bidderA, firstPitch), sendPitch(id, bidderA, firstPitch)]);
    expect(competingPitches.map((r) => r.status).sort()).toEqual([201, 409]);
    const bidA = (await competingPitches.find((r) => r.status === 201)!.json()).id as number;
    const bidB = await makePitch(id, bidderB, secondPitch);
    expect((await pool.query("select bid_count from leads where id = $1", [id])).rows[0].bid_count).toBe(2);
    expect((await pool.query("select user_id from lead_bids where lead_id = $1 order by user_id", [id])).rows.map((r) => r.user_id)).toEqual([bidderA.id, bidderB.id].sort((a, b) => a - b));
    expect((await pool.query("select count(*)::int as n from notifications where type = 'lead_bid' and entity_id = $1", [id])).rows[0].n).toBe(2);

    const otherLead = await fixture(buyer);
    const wrongBid = await makePitch(otherLead.id, bidderB);
    expect((await award(id, wrongBid, buyer)).status).toBe(404);
    expect((await award(id, bidA, reviewer)).status).toBe(403);
    expect((await award(id, bidA, bidderA)).status).toBe(403);
    expect((await outcome(id, "close_without_hire", reviewer)).status).toBe(403);
    expect((await outcome(id, "close_without_hire")).status).toBe(401);

    const html = (actor?: Actor) => request(path, actor).then((response) => {
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      return response.text();
    });
    const buyerHtml = await html(buyer);
    expect(buyerHtml).toContain(firstPitch.message);
    expect(buyerHtml).toContain(secondPitch.message);
    expect(buyerHtml).toContain("€71 / hr");
    const aHtml = await html(bidderA);
    expect(aHtml).toContain(firstPitch.message);
    expect(aHtml).not.toContain(secondPitch.message);
    const bHtml = await html(bidderB);
    expect(bHtml).toContain(secondPitch.message);
    expect(bHtml).not.toContain(firstPitch.message);
    for (const actor of [undefined, reviewer, observer]) {
      const page = await html(actor);
      expect(page).not.toContain(firstPitch.message);
      expect(page).not.toContain(secondPitch.message);
      expect(page).not.toContain("€71 / hr");
      expect(page).not.toContain("Confirm award");
    }
    async function boardItem() {
      const board = await request("/api/leads").then((r) => r.text());
      expect(board).not.toContain(firstPitch.message);
      expect(board).not.toContain(secondPitch.message);
      expect(board).not.toContain('"acceptedBidId"');
      expect(board).not.toContain('"assignedUserId"');
      return JSON.parse(board).items.find((item: { id: number }) => item.id === id);
    }
    expect(await boardItem()).toMatchObject({ status: "open", engagement: "open", acceptingBids: true, bidCount: 2, currency: "EUR", budgetUnit: "hourly" });

    await pool.query("update leads set deadline_at = now() - interval '1 minute' where id = $1", [id]);
    expect((await sendPitch(id, observer, firstPitch)).status).toBe(409);
    expect(await boardItem()).toMatchObject({ status: "open", engagement: "deadline_passed", acceptingBids: false });
    const awards = await Promise.all([award(id, bidA, buyer), award(id, bidB, buyer)]);
    expect(awards.map((r) => r.status).sort()).toEqual([200, 409]);
    const selection = await awards.find((r) => r.status === 200)!.json();
    const winner = selection.acceptedBidId === bidA ? bidderA : bidderB;
    const loser = winner === bidderA ? bidderB : bidderA;
    const otherBid = winner === bidderA ? bidB : bidA;
    expect(selection).toEqual({ acceptedBidId: winner === bidderA ? bidA : bidB, assignedUserId: winner.id, status: "awarded" });

    const awardState = async () => (await pool.query("select accepted_bid_id, assigned_user_id, status, awarded_at, completed_at from leads where id = $1", [id])).rows[0];
    const beforeRetry = await awardState();
    expect(beforeRetry).toEqual({ accepted_bid_id: selection.acceptedBidId, assigned_user_id: winner.id, status: "awarded", awarded_at: expect.any(Date), completed_at: null });
    expect((await pool.query("select id from lead_bids where lead_id = $1 and is_accepted", [id])).rows).toEqual([{ id: selection.acceptedBidId }]);
    const retries = await Promise.all([award(id, selection.acceptedBidId, buyer), award(id, selection.acceptedBidId, buyer)]);
    for (const retry of retries) {
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual(selection);
    }
    expect(await awardState()).toEqual(beforeRetry);
    expect(await boardItem()).toMatchObject({ status: "awarded", engagement: "awarded", acceptingBids: false });
    expect((await award(id, otherBid, buyer)).status).toBe(409);
    expect((await outcome(id, "close_without_hire", buyer)).status).toBe(409);

    const noticeCount = () => pool.query("select user_id from notifications where type = 'lead_bid_accepted' and entity_id = $1", [id]).then((r) => r.rows);
    const karmaEvents = () => pool.query("select user_id, amount from karma_events where reason = 'lead_bid_accepted' and user_id = any($1::int[])", [[bidderA.id, bidderB.id]]).then((r) => r.rows);
    expect(await noticeCount()).toEqual([{ user_id: winner.id }]);
    expect(await karmaEvents()).toEqual([{ user_id: winner.id, amount: 50 }]);
    const winnerNotices = await request("/api/notifications", winner).then((r) => r.json());
    expect(winnerNotices.notifications).toEqual(expect.arrayContaining([expect.objectContaining({ type: "lead_bid_accepted", entityId: id })]));
    expect(await request("/api/notifications", loser).then((r) => r.text())).not.toContain(title);

    const completed = await outcome(id, "complete", buyer);
    expect(completed.status).toBe(200);
    const result = await completed.json();
    expect(result).toEqual({ status: "completed", completedAt: expect.any(String) });
    expect(await outcome(id, "complete", buyer).then((r) => r.json())).toEqual(result);
    expect(await award(id, selection.acceptedBidId, buyer).then((r) => r.json())).toEqual({ ...selection, status: "completed" });
    expect((await outcome(id, "cancel", buyer)).status).toBe(409);
    expect((await outcome(id, "reopen", buyer)).status).toBe(422);
    expect(await noticeCount()).toEqual([{ user_id: winner.id }]);
    expect(await karmaEvents()).toEqual([{ user_id: winner.id, amount: 50 }]);
    const publicPage = await html();
    expect(publicPage).toContain("Completed");
    expect(publicPage).toContain("does not verify payment");
    expect(publicPage).not.toContain("Winning pitch");
    expect(await boardItem()).toMatchObject({ status: "completed", engagement: "completed", acceptingBids: false });
    const active = await request("/api/leads?active=1&author=demo-buyer").then((r) => r.json());
    expect(active.items.some((item: { id: number }) => item.id === id)).toBe(false);
    const completedState = await awardState();
    expect(completedState.completed_at.toISOString()).toBe(result.completedAt);
    expect(completedState.awarded_at).toEqual(beforeRetry.awarded_at);

    const report = await request("/api/reports", observer, "POST", { targetType: "lead", targetId: id, reason: "off_topic" });
    expect(report.status).toBe(201);
    expect((await request(`/api/mod/reports/${(await report.json()).id}`, reviewer, "PATCH", { action: "approve" })).status).toBe(200);
    expect(await awardState()).toEqual(completedState);
    expect((await request(path)).status).toBe(404);
    expect((await request(path, winner)).status).toBe(404);
    const removedPage = await request(path, reviewer).then((r) => r.text());
    expect(removedPage).not.toContain(firstPitch.message);
    expect(removedPage).not.toContain(secondPitch.message);
    expect(await boardItem()).toBeUndefined();
    expect((await outcome(id, "complete", buyer)).status).toBe(404);
    expect((await sendPitch(id, observer, firstPitch)).status).toBe(404);
  });

  it("keeps close-without-hire and post-award cancellation terminal and distinct", async () => {
    const toClose = await fixture(buyer);
    const bidToClose = await makePitch(toClose.id, bidderA);
    expect(await outcome(toClose.id, "close_without_hire", buyer).then((r) => r.json())).toEqual({ status: "closed" });
    expect((await award(toClose.id, bidToClose, buyer)).status).toBe(409);
    expect((await outcome(toClose.id, "complete", buyer)).status).toBe(409);
    expect((await sendPitch(toClose.id, bidderB, secondPitch)).status).toBe(409);
    expect((await request(permalink(toClose)).then((r) => r.text()))).toContain("Closed without hire");

    const toCancel = await fixture(buyer);
    const bidToCancel = await makePitch(toCancel.id, bidderB);
    await pool.query("update leads set status = 'in_review' where id = $1", [toCancel.id]);
    expect((await sendPitch(toCancel.id, bidderA, firstPitch)).status).toBe(409);
    expect((await award(toCancel.id, bidToCancel, buyer)).status).toBe(200);
    expect(await outcome(toCancel.id, "cancel", buyer).then((r) => r.json())).toEqual({ status: "cancelled" });
    expect((await outcome(toCancel.id, "complete", buyer)).status).toBe(409);
    expect((await sendPitch(toCancel.id, bidderA, firstPitch)).status).toBe(409);
    const { rows: [saved] } = await pool.query("select status, accepted_bid_id, assigned_user_id, awarded_at, completed_at from leads where id = $1", [toCancel.id]);
    expect(saved).toEqual({ status: "cancelled", accepted_bid_id: bidToCancel, assigned_user_id: bidderB.id, awarded_at: expect.any(Date), completed_at: null });
    expect((await request(permalink(toCancel)).then((r) => r.text()))).toContain("Cancelled");
  });

  it("does not operate on pending or ambiguous legacy awards or let suspended owners mutate", async () => {
    const pending = await fixture(buyer, { publication: "pending_review" });
    expect((await award(pending.id, 1, buyer)).status).toBe(404);
    expect((await outcome(pending.id, "complete", buyer)).status).toBe(409);
    expect((await outcome(pending.id, "close_without_hire", reviewer)).status).toBe(404);
    expect((await request(permalink(pending), observer)).status).toBe(404);

    const flagged = await fixture(buyer);
    await pool.query("update leads set award_needs_review = true where id = $1", [flagged.id]);
    expect((await sendPitch(flagged.id, bidderA, firstPitch)).status).toBe(409);
    expect((await outcome(flagged.id, "close_without_hire", buyer)).status).toBe(409);
    expect(await request(permalink(flagged), buyer).then((r) => r.text())).toContain("This older award record needs review");
    expect(await request(permalink(flagged)).then((r) => r.text())).not.toContain("This older award record needs review");

    const suspended = await fixture(observer);
    const bid = await makePitch(suspended.id, bidderA);
    await pool.query("update users set is_banned = true where id = $1", [observer.id]);
    try {
      expect((await award(suspended.id, bid, observer)).status).toBe(403);
      expect((await outcome(suspended.id, "close_without_hire", observer)).status).toBe(403);
    } finally {
      await pool.query("update users set is_banned = false where id = $1", [observer.id]);
    }
  });

  it("serializes each bidder's existing six-pitch window across different leads", async () => {
    const listings = await Promise.all(Array.from({ length: 7 }, () => fixture(buyer)));
    const responses = await Promise.all(listings.map((lead) => sendPitch(lead.id, observer, firstPitch)));
    expect(responses.map((r) => r.status).sort()).toEqual([201, 201, 201, 201, 201, 201, 429]);
    const limited = responses.find((r) => r.status === 429)!;
    expect(limited.headers.get("retry-after")).toBe("600");
    expect(await limited.json()).toMatchObject({ code: "rate_limited" });
    expect((await pool.query("select count(*)::int as n from lead_bids where user_id = $1", [observer.id])).rows[0].n).toBe(6);
    const rejected = listings[responses.indexOf(limited)];
    await pool.query("update lead_bids set created_at = now() - interval '11 minutes' where user_id = $1", [observer.id]);
    await makePitch(rejected.id, observer);
  });
});
