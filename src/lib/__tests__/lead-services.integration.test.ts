import { createHash, randomBytes, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const wire = process.env.BORYNX_PILOT_TEST_WIRE;
const dbUrl = process.env.BORYNX_PILOT_TEST_DATABASE_URL;
const appOrigin = "https://buyer-pilot.example.test";
const authOrigin = "https://auth.buyer-pilot.example.test";
const on = process.env.BORYNX_PILOT_TEST_ENABLED === "1";
// This suite creates fictitious users and sessions only in the exact disposable runner database.
const safe = Boolean(wire && dbUrl && /^http:\/\/127\.0\.0\.1:\d+$/.test(wire) &&
  new URL(dbUrl).hostname === "127.0.0.1" && new URL(dbUrl).pathname === "/borynx_demo_buyer_pilot" && !new URL(dbUrl).search);

type Actor = { id: number; email: string; token: string };
type ServiceOrder = { id: number; state: string };
type Listing = { id: number; href: string; category: string; title: string; slug: string };

function send(path: string, actor?: Actor, method = "GET", json?: object, from = appOrigin, extra: Record<string, string> = {}) {
  return new Promise<Response>((resolve, reject) => {
    const body = json ? JSON.stringify(json) : undefined;
    const req = httpRequest(`${wire}${path}`, {
      method, signal: AbortSignal.timeout(45_000), headers: {
        Host: new URL(appOrigin).host,
        ...(method !== "GET" && { Origin: from }),
        ...(actor && { Cookie: `__Host-bx_auth=${actor.token}` }),
        ...(body && { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)) }),
        ...extra,
      },
    }, (res) => {
      res.setEncoding("utf8");
      let html = "";
      res.on("data", (chunk) => { html += chunk; });
      res.on("end", () => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        resolve(new Response(html, { status: res.statusCode, headers }));
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function read<T = Record<string, unknown>>(response: Promise<Response> | Response, status = 200): Promise<T> {
  const res = await response;
  const json = await res.json();
  expect(res.status, JSON.stringify(json)).toBe(status);
  expect(res.headers.get("cache-control")).toContain("no-store");
  return json as T;
}

async function page(path: string, actor?: Actor) {
  const response = await send(path, actor);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  return (await response.text()).replaceAll("<!-- -->", "");
}

const requestService = (lead: Listing, actor?: Actor, kind = "assisted_hire", contactConsent = true) =>
  send(`/api/leads/${lead.id}/services`, actor, "POST", { kind, contactConsent });
const update = (orderId: number, actor: Actor, action: string) => send(`/api/mod/lead-services/${orderId}`, actor, "PATCH", { action });
const dashboard = "/me/lead-services";
const slot = 'aria-labelledby="sponsored-lead-heading"';

async function createActor(pool: Pool, role: "member" | "moderator" | "admin" = "member") {
  const username = `pilot-${randomUUID().slice(0, 10)}`;
  const email = `${username}@example.test`;
  const token = randomBytes(32).toString("base64url");
  const { rows: [user] } = await pool.query<{ id: number }>("insert into users (username, display_name, role) values ($1,$1,$2) returning id", [username, role]);
  const { rows: [identity] } = await pool.query<{ id: number }>(`insert into borynx_private.auth_identities (provider,subject,user_id,email,verified_at)
    values ($1,$2,$3,$4,now()) returning id`, [`supabase:${authOrigin}`, randomUUID(), user.id, email]);
  await pool.query("insert into sessions (id,user_id,auth_identity_id,expires_at) values ($1,$2,$3,now() + interval '1 day')", [createHash("sha256").update(token).digest("hex"), user.id, identity.id]);
  return { id: user.id, email, token };
}

const brief = (title: string, category = "Web & Mobile") => ({
  title, category, description: "Deliver a practical accessibility audit for three checkout screens. Include documented examples and prioritized fixes.",
  budgetMin: 200, budgetMax: 400, currency: "USD", budgetUnit: "fixed", deliveryTimeline: "Two weeks from kickoff",
  kind: "contract", skillTags: ["accessibility"], submissionKey: randomUUID(),
});

async function createApprovedLead(pool: Pool, actor: Actor, reviewer: Actor, title: string, category = "Web & Mobile") {
  const { id } = await read<{ id: number }>(send("/api/leads", actor, "POST", brief(title, category)), 201);
  await read(send(`/api/mod/leads/${id}`, reviewer, "PATCH", { revision: 1, action: "publish" }));
  return readListing(pool, id);
}

async function readListing(pool: Pool, id: number): Promise<Listing> {
  const { rows: [row] } = await pool.query<Omit<Listing, "href">>("select id, slug, title, category from leads where id=$1", [id]);
  return { ...row, href: `/l/${id}/${row.slug}` };
}

describe.skipIf(!safe || !on)("buyer marketplace pilot with verified sessions on disposable PostgreSQL", () => {
  let pool: Pool;
  let admin: Actor;
  let moderator: Actor;
  let buyer: Actor;
  let other: Actor;
  let lead: Listing;
  let second: Listing;
  beforeAll(async () => {
    pool = new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 5_000 });
    [admin, moderator, buyer, other] = await Promise.all([createActor(pool, "admin"), createActor(pool, "moderator"), createActor(pool), createActor(pool)]);
  });
  afterAll(async () => { await pool?.end(); });

  it("serializes distinct verified submissions and requires publication before the buyer can request a service", async () => {
    const drafts = [brief("Buyer pilot first accessibility brief"), brief("Buyer pilot second accessibility brief")];
    const results = await Promise.all(drafts.map((draft) => send("/api/leads", buyer, "POST", draft)));
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const won = results.findIndex((result) => result.status === 201);
    const { id } = await read<{ id: number }>(results[won], 201);
    expect(await read(results[1 - won], 409)).toMatchObject({ code: "active_lead_limit" });
    expect(await read(send("/api/leads", buyer, "POST", drafts[won]))).toMatchObject({ id });
    lead = await readListing(pool, id);
    expect((await page("/l/new", buyer))).toContain("You already have an active lead");
    expect((await requestService(lead, buyer)).status).toBe(404);
    expect(await page(`/l/${id}`, buyer)).not.toContain('id="buyer-services"');
    await read(send(`/api/mod/leads/${id}`, moderator, "PATCH", { revision: 1, action: "publish" }));
    const owner = await page(lead.href, buyer);
    expect(owner).toContain("₦25,000");
    expect(owner).toContain("Delivery timeline:");
    expect(owner).toContain("Request Assisted Hire");
    expect(await page(lead.href, other)).not.toContain('id="buyer-services"');
    expect(await page(lead.href)).not.toContain('id="buyer-services"');
    second = await createApprovedLead(pool, other, moderator, "Buyer pilot approved separate category", "Data Science");
  });

  it("requires consent, a verified owner and an administrator, then records off-app delivery and refunds privately", async () => {
    expect(await read(requestService(lead), 401)).toMatchObject({ code: "unauthenticated" });
    expect((await requestService(lead, other)).status).toBe(404);
    expect((await requestService(lead, buyer, "assisted_hire", false)).status).toBe(422);
    expect((await send(`/api/leads/${lead.id}/services`, buyer, "POST", { kind: "assisted_hire", contactConsent: true, amountMinor: 1 })).status).toBe(422);
    expect((await send(`/api/leads/${lead.id}/services`, buyer, "POST", { kind: "assisted_hire", contactConsent: true }, "https://outside.example.test")).status).toBe(403);
    expect((await send(`/api/leads/${lead.id}/services`, buyer, "POST", { filler: "A".repeat(1500) })).status).toBe(413);
    const [one, two] = await Promise.all([requestService(lead, buyer), requestService(lead, buyer)]);
    expect([one.status, two.status].sort()).toEqual([200, 201]);
    const order = await read<ServiceOrder>(one, one.status);
    expect(await read(two, two.status)).toEqual(order);
    expect(order).toEqual({ id: expect.any(Number), state: "requested" });
    expect((await pool.query("select amount_minor, state from borynx_private.lead_service_orders where lead_id=$1", [lead.id])).rows).toEqual([{ amount_minor: 2_500_000, state: "requested" }]);
    expect((await send(dashboard)).status).toBe(307);
    for (const actor of [buyer, other, moderator]) {
      const html = await page(dashboard, actor);
      expect(html).not.toContain("Pilot operations");
      expect(html).not.toContain(buyer.email);
      expect(html.includes(`Request #${order.id}`)).toBe(actor === buyer);
      expect((await update(order.id, actor, "confirm_payment")).status).toBe(403);
    }
    expect(await page(dashboard, admin)).toContain(buyer.email);
    expect((await update(order.id, admin, "deliver")).status).toBe(409);
    await pool.query("update users set is_banned=true where id=$1", [admin.id]);
    expect((await update(order.id, admin, "confirm_payment")).status).toBe(403);
    await pool.query("update users set is_banned=false where id=$1", [admin.id]);
    await pool.query("update leads set deadline_at=now()-interval '1 second' where id=$1", [lead.id]);
    expect((await update(order.id, admin, "confirm_payment")).status).toBe(409);
    await pool.query("update leads set deadline_at=null where id=$1", [lead.id]);
    expect(await read(update(order.id, admin, "confirm_payment"))).toMatchObject({ state: "confirmed" });
    expect(await page(dashboard, buyer)).toContain("Shortlist due:");
    expect(await read(update(order.id, admin, "deliver"))).toMatchObject({ state: "delivered" });
    expect(await page(dashboard, admin)).not.toContain(buyer.email);
    expect(await read(update(order.id, admin, "record_refund"))).toMatchObject({ state: "refunded" });
    expect(await page(dashboard, buyer)).toContain("Refund recorded");
    expect(await page(lead.href)).not.toContain("Assisted Hire");
    expect(await read(send("/api/leads"))).not.toHaveProperty("sponsored");
    expect((await pool.query("select publication_status,status,is_verified from leads where id=$1", [lead.id])).rows[0]).toEqual({ publication_status: "published", status: "open", is_verified: false });
  });

  it("separates an administrator's own requests from their queue and requires an available contact for confirmation", async () => {
    const adminBuyer = await createActor(pool, "admin");
    const own = await createApprovedLead(pool, adminBuyer, moderator, "Administrator also needs a shortlist");
    const { id } = await read<ServiceOrder>(requestService(own, adminBuyer), 201);
    const ownPage = await page(dashboard, adminBuyer);
    expect(ownPage.match(new RegExp(`Request #${id}(?=<)`, "g"))).toHaveLength(1);
    expect(ownPage).not.toContain(adminBuyer.email);
    expect(await read(update(id, adminBuyer, "confirm_payment"), 403)).toMatchObject({ code: "forbidden" });
    expect(await read(update(id, adminBuyer, "decline"), 403)).toMatchObject({ code: "forbidden" });
    expect(await page(dashboard, admin)).toContain(adminBuyer.email);
    await pool.query("delete from borynx_private.auth_identities where user_id=$1", [adminBuyer.id]);
    expect(await page(dashboard, admin)).not.toContain(adminBuyer.email);
    expect(await read(update(id, admin, "confirm_payment"), 409)).toMatchObject({ code: "service_conflict" });
    expect(await read(update(id, admin, "decline"))).toMatchObject({ state: "declined" });
  });

  it("serializes one bought slot, respects filters and public eligibility, and leaves organic discovery unchanged", async () => {
    const organic = await read(send("/api/leads"));
    expect(await page("/l")).not.toContain(slot);
    const [a, b] = await Promise.all([read<ServiceOrder>(requestService(lead, buyer, "sponsored_lead"), 201), read<ServiceOrder>(requestService(second, other, "sponsored_lead"), 201)]);
    const results = await Promise.all([update(a.id, admin, "confirm_payment"), update(b.id, admin, "confirm_payment")]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const [activeLead, active, waiting] = results[0].status === 200 ? [lead, a, b] : [second, b, a];
    const [otherCategory, waitingLead] = results[0].status === 200 ? [second.category, second] : [lead.category, lead];
    const board = await page("/l");
    expect(board.match(new RegExp(slot, "g"))).toHaveLength(1);
    expect(board.match(/<section aria-labelledby="sponsored-lead-heading"[^>]*>([\s\S]*?)<\/section>/)?.[1]).toContain(activeLead.title);
    expect((await page(`/l?category=${encodeURIComponent(activeLead.category)}`))).toContain(slot);
    expect((await page(`/l?category=${encodeURIComponent(otherCategory)}`))).not.toContain(slot);
    expect(await read(send("/api/leads"))).toEqual(organic);
    expect(board).not.toContain(buyer.email);
    expect(board).not.toContain(other.email);
    expect(board).not.toContain("₦5,000");
    expect((await pool.query("select amount_minor, sponsor_until-confirmed_at as window from borynx_private.lead_service_orders where id=$1", [active.id])).rows[0]).toMatchObject({ amount_minor: 500_000, window: expect.objectContaining({ days: 7 }) });
    await pool.query("update leads set deadline_at=now()-interval '1 minute' where id=$1", [activeLead.id]);
    expect(await page("/l")).not.toContain(slot);
    expect((await update(waiting.id, admin, "confirm_payment")).status).toBe(409); // not a second paid reservation
    await pool.query("update leads set deadline_at=null where id=$1", [activeLead.id]);
    await pool.query("update borynx_private.lead_service_orders set confirmed_at=now()-interval '8 days', sponsor_until=now()-interval '1 day' where id=$1", [active.id]);
    expect(await page("/l")).not.toContain(slot);
    expect(await read(update(waiting.id, admin, "confirm_payment"))).toMatchObject({ state: "confirmed" });
    await pool.query("update leads set is_removed=true where id=$1", [waitingLead.id]);
    expect(await page("/l")).not.toContain(slot);
    await pool.query("update leads set is_removed=false where id=$1", [waitingLead.id]);
    expect(await page("/l")).toContain(slot); // retained for the opt-out test on restart
  });
});

describe.skipIf(!safe || on)("paid pilot opt-out", () => {
  it("hides a still-reserved slot and denies both services after the flags are disabled", async () => {
    const pool = new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 5_000 });
    try {
      expect((await pool.query("select id from borynx_private.lead_service_orders where sponsor_until>now() and state='confirmed'")).rowCount).toBe(1);
      expect(await page("/l")).not.toContain(slot);
      const buyer = await createActor(pool);
      const reviewer = await createActor(pool, "moderator");
      const lead = await createApprovedLead(pool, buyer, reviewer, "Buyer pilot flags-disabled separate lead");
      expect(await page(lead.href, buyer)).not.toContain('id="buyer-services"');
      for (const kind of ["assisted_hire", "sponsored_lead"]) expect((await requestService(lead, buyer, kind)).status).toBe(404);
      expect(await page(dashboard, buyer)).toContain("No requests yet");
    } finally { await pool.end(); }
  });
});
