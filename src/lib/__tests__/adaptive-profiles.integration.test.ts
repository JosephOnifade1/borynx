import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isDemoDatabaseUrl } from "../demo-mode";

const origin = process.env.BORYNX_PROFILE_TEST_ORIGIN;
const databaseUrl = process.env.BORYNX_PROFILE_TEST_DATABASE_URL;
const enabled = Boolean(origin && new URL(origin).hostname === "127.0.0.1" && isDemoDatabaseUrl(databaseUrl));
const privateCompany = "Intake Company Must Stay Private";
const profilePath = "/f/profile-buyer";

type Actor = { id: number; cookie: string };
type Options = { actor?: Actor; method?: string; body?: unknown };

function request(path: string, { actor, method, body }: Options = {}) {
  const headers = new Headers();
  if (actor) headers.set("Cookie", actor.cookie);
  if (method && origin) headers.set("Origin", origin);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return fetch(`${origin}${path}`, { headers, method, redirect: "manual", body: body === undefined ? undefined : JSON.stringify(body) });
}

async function login(username: string): Promise<Actor> {
  const response = await request("/api/auth/login", { method: "POST", body: { username } });
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  expect(cookie).toMatch(/^bx_session=/);
  return { id: (await response.json()).user.id, cookie: cookie! };
}

const patchProfile = (body: unknown, actor?: Actor) => request("/api/me", { method: "PATCH", body, actor });
const patch = (path: string, body: unknown, actor: Actor) => request(path, { method: "PATCH", body, actor });
const post = (path: string, body: unknown, actor: Actor) => request(path, { method: "POST", body, actor });
const html = async (path: string, actor?: Actor) => {
  const response = await request(path, { actor });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  return response.text();
};

function expectCounts(markup: string, published: number, accepting: number, completed: number) {
  const counts = markup.match(/<dl\b[^>]*aria-label="Public hiring counts"[^>]*>([\s\S]*?)<\/dl>/)?.[1];
  expect(counts).toBeDefined();
  for (const [label, n] of [["Public leads", published], ["Accepting bids", accepting], ["Completed", completed]] as const) {
    expect(counts).toMatch(new RegExp(`<dt[^>]*>${label}</dt><dd[^>]*>${n}</dd>`));
  }
}

async function submitLead(title: string, actor: Actor) {
  const response = await post("/api/leads", {
    title, description: "Inspect keyboard navigation in three checkout screens and deliver a prioritized report with annotated examples and fixes.",
    deliveryTimeline: "Deliver within two weeks",
    kind: "contract", category: "Web & Mobile", currency: "USD", budgetMin: 200, budgetMax: 400, budgetUnit: "fixed",
    skillTags: ["accessibility"], submissionKey: randomUUID(), deadlineAt: new Date(Date.now() + 3_600_000).toISOString(),
  }, actor);
  expect(response.status).toBe(201);
  return (await response.json()).id as number;
}

async function submitPitch(id: number, message: string, actor: Actor) {
  const response = await post(`/api/leads/${id}/bids`, { amount: 300, message }, actor);
  expect(response.status).toBe(201);
  return (await response.json()).id as number;
}

describe.skipIf(!enabled)("adaptive profiles on disposable PostgreSQL", () => {
  let pool: Pool;
  let buyer: Actor;
  let worker: Actor;
  let reviewer: Actor;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
    [buyer, worker, reviewer] = await Promise.all([login("profile-buyer"), login("profile-worker"), login("profile-reviewer")]);
  });
  afterAll(async () => { await pool?.end(); });

  it("keeps intake-only company data out of both the public profile and owner editor", async () => {
    expect((await patchProfile({ lookingToHire: true })).status).toBe(401);
    const res = await patchProfile({ lookingToHire: true }, buyer);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const result = await res.json();
    expect(result).toMatchObject({ ok: true, user: {
      id: buyer.id, role: "member", karma: 47, companyName: null, lookingToHire: true, availableForWork: false,
    } });
    expect(result.user).not.toHaveProperty("companyNamePublic");
    expect(JSON.stringify(result)).not.toContain(privateCompany);
    for (const session of [undefined, buyer, worker, reviewer]) {
      const page = await html(profilePath, session);
      expect(page).toContain("Open to hiring");
      expect(page).not.toContain(privateCompany);
      expect(page).not.toContain("Currently hiring");
      expectCounts(page, 0, 0, 0);
    }
    expect(await html("/settings", buyer)).not.toContain(privateCompany);
    expect(await html("/", buyer)).not.toContain(privateCompany);
    for (const path of ["/api/me", "/api/users/profile-buyer"]) {
      const payload = await request(path, { actor: buyer }).then((r) => r.json());
      const account = path === "/api/me" ? payload.user : payload;
      for (const field of ["companyName", "companyNamePublic", "email", "authIdentityId", "subject", "hourlyRate"]) {
        expect(account).not.toHaveProperty(field);
      }
    }
    expect((await pool.query("select company_name, company_name_public from users where id = $1", [buyer.id])).rows[0])
      .toEqual({ company_name: privateCompany, company_name_public: false });
  });

  it("supports all four intent combinations, public opt-in and clearing, without changing roles", async () => {
    const badInputs = [
      [{ lookingToHire: "true" }, "lookingToHire"],
      [{ availableForWork: 1 }, "availableForWork"],
      [{ companyName: "A".repeat(101) }, "companyName"],
      [{ companyUrl: "http://studio.example.test" }, "companyUrl"],
      [{ companyUrl: "https://login:password@studio.example.test" }, "companyUrl"],
      [{ hourlyRate: 21.5, hourlyCurrency: "GBP" }, "hourlyRate"],
      [{ hourlyRate: 85 }, "hourlyCurrency"],
      [{ hourlyRate: 85, hourlyCurrency: "CAD" }, "hourlyCurrency"],
      [{ lookingToHire: false, role: "admin" }, "role"],
      [{ companyNamePublic: true }, "companyNamePublic"],
    ] as const;
    for (const [body, field] of badInputs) {
      const result = await patchProfile(body, buyer);
      expect(result.status).toBe(422);
      expect(await result.json()).toMatchObject({ code: "invalid_profile", fields: { [field]: expect.any(String) } });
    }
    expect((await patchProfile(null, buyer)).status).toBe(400);
    expect((await patchProfile([], buyer)).status).toBe(400);
    await pool.query("update users set is_banned = true where id = $1", [worker.id]);
    expect((await patchProfile({ availableForWork: true }, worker)).status).toBe(403);
    await pool.query("update users set is_banned = false where id = $1", [worker.id]);

    const companyName = "Profile Test Studio";
    const companyUrl = "https://studio.example.test/work";
    const valid = await patchProfile({ companyName: ` ${companyName} `, companyUrl, hourlyRate: 85, hourlyCurrency: "GBP" }, buyer);
    expect(valid.status).toBe(200);
    expect(await valid.json()).toMatchObject({ user: { id: buyer.id, role: "member", companyName, companyUrl, hourlyRate: 85, hourlyCurrency: "GBP" } });

    for (const [lookingToHire, availableForWork] of [[false, false], [true, false], [false, true], [true, true]]) {
      const updated = await patchProfile({ lookingToHire, availableForWork }, buyer);
      expect(updated.status).toBe(200);
      expect(await updated.json()).toMatchObject({ user: { id: buyer.id, role: "member", lookingToHire, availableForWork } });
      const page = await html(profilePath);
      expect(page.includes("Open to hiring")).toBe(lookingToHire);
      expect(page.includes("Available for work")).toBe(availableForWork);
      expect(page.includes(companyName)).toBe(lookingToHire);
      expect(page.includes(`href="${companyUrl}"`)).toBe(lookingToHire);
      expect(page.includes("£85 / hr")).toBe(availableForWork);
      expect(page).not.toContain("Currently hiring");
      const tabPath = lookingToHire && !availableForWork ? `${profilePath}?tab=leads` : profilePath;
      const selectedTab = page.match(/<a\b[^>]*aria-current="page"[^>]*>/g)?.find((tag) => tag.includes(`href="${tabPath}"`));
      expect(selectedTab).toBeDefined();
    }
    const partials = await Promise.all([patchProfile({ hourlyRate: 100 }, buyer), patchProfile({ hourlyCurrency: "EUR" }, buyer)]);
    expect(partials.map((r) => r.status)).toEqual([200, 200]);
    expect(await html(profilePath)).toContain("€100 / hr");
    const clear = await patchProfile({ companyName: null, companyUrl: null, hourlyCurrency: null }, buyer);
    expect(clear.status).toBe(200);
    expect(await clear.json()).toMatchObject({ user: { companyName: null, companyUrl: null, hourlyRate: null, hourlyCurrency: null } });
    const cleared = await html(profilePath);
    expect(cleared).not.toContain(companyName);
    expect(cleared).not.toContain("€100 / hr");
  });

  it("counts only visible solutions in the freelancer profile and hover card", async () => {
    const { rows: rooms } = await pool.query<{ id: number; privacy: string }>(`insert into spaces (slug, name, privacy) values
      ('solutions-public', 'Visible Solutions', 'public'), ('solutions-private', 'Private Solutions', 'private') returning id, privacy`);
    const publicRoom = rooms.find((room) => room.privacy === "public")!.id;
    const privateRoom = rooms.find((room) => room.privacy === "private")!.id;
    const { rows: threads } = await pool.query<{ id: number; slug: string }>(`insert into posts (space_id, author_id, slug, title, body, author_deleted_at) values
      ($1, $3, 'solution-visible', 'Public solution fixture', 'Example text', null),
      ($2, $3, 'solution-private', 'Private solution fixture', 'Example text', null),
      ($1, $3, 'solution-deleted', 'Deleted solution fixture', 'Example text', now()) returning id, slug`, [publicRoom, privateRoom, reviewer.id]);
    for (const { id } of threads) {
      await pool.query("insert into comments (post_id, author_id, body, is_solution) values ($1, $2, 'Example response', true)", [id, worker.id]);
    }
    await pool.query("insert into comments (post_id, author_id, body, is_solution, is_removed) values ($1, $2, 'Removed response', true, true)",
      [threads.find((thread) => thread.slug === "solution-visible")!.id, worker.id]);
    for (const [actor, count] of [[undefined, 1], [buyer, 1], [reviewer, 2]] as const) {
      const hover = await request("/api/users/profile-worker", { actor });
      expect(hover.status).toBe(200);
      expect(hover.headers.get("cache-control")).toContain("no-store");
      expect(await hover.json()).toMatchObject({ solutionCount: count });
      expect(await html("/f/profile-worker", actor)).toMatch(new RegExp(`<dd[^>]*>${count}</dd><dt[^>]*>solutions</dt>`));
    }
  });

  it("derives hiring counts from public leads and keeps hire and bid actions independent of profile settings", async () => {
    expect((await patchProfile({ lookingToHire: false, availableForWork: false }, buyer)).status).toBe(200);
    const ownLeadTitle = "Public Checkout Accessibility Fixture";
    const leadId = await submitLead(ownLeadTitle, buyer);
    const leadsTab = `${profilePath}?tab=leads`;
    const pending = await html(leadsTab);
    expect(pending).not.toContain(ownLeadTitle);
    expect(pending).not.toContain("Currently hiring");
    expect((await patch(`/api/mod/leads/${leadId}`, { action: "publish", revision: 1 }, reviewer)).status).toBe(200);
    const first = await html(leadsTab);
    expect(first).toContain("Currently hiring"); // even with both preferences off
    expect(first).toContain("New Poster");
    expect(first).toContain(ownLeadTitle);
    expectCounts(first, 1, 1, 0);

    const { rows: [privateSpace, restrictedSpace] } = await pool.query<{ id: number }>(`insert into spaces (slug, name, privacy) values
      ('profile-private', 'Private Profile Fixture', 'private'), ('profile-restricted', 'Restricted Profile Fixture', 'restricted') returning id`);
    await pool.query(`insert into leads (author_id, slug, title, description, category, publication_status, is_removed, space_id, deadline_at, status, completed_at, award_needs_review)
      values ($1, 'profile-pending', 'Hidden Pending Canary', 'Fixture scope', 'Web & Mobile', 'pending_review', false, null, null, 'open', null, false),
             ($1, 'profile-removed', 'Hidden Removed Canary', 'Fixture scope', 'Web & Mobile', 'published', true, null, null, 'open', null, false),
             ($1, 'profile-private-space', 'Hidden Private Canary', 'Fixture scope', 'Web & Mobile', 'published', false, $2, null, 'open', null, false),
             ($1, 'profile-restricted-space', 'Hidden Restricted Canary', 'Fixture scope', 'Web & Mobile', 'published', false, $3, null, 'open', null, false),
             ($1, 'profile-expired', 'Visible Expired Fixture', 'Fixture scope', 'Web & Mobile', 'published', false, null, now() - interval '1 day', 'open', null, false),
             ($1, 'profile-no-award', 'Visible Unconfirmed Completion', 'Fixture scope', 'Web & Mobile', 'published', false, null, null, 'completed', now(), false),
             ($1, 'profile-legacy-review', 'Visible Legacy Review Fixture', 'Fixture scope', 'Web & Mobile', 'published', false, null, null, 'open', null, true)`,
    [buyer.id, privateSpace.id, restrictedSpace.id]);
    const otherLead = await submitLead("Separate Work Opportunity Fixture", worker);
    expect((await patch(`/api/mod/leads/${otherLead}`, { action: "publish", revision: 1 }, reviewer)).status).toBe(200);
    await submitPitch(otherLead, "Private pitch by the same user who authored a lead, without declaring availability.", buyer);
    const pitchBody = "Winning pitch must stay private in profile HTML and API payloads after recording completion.";
    const bidId = await submitPitch(leadId, pitchBody, worker);
    const before = await html(leadsTab, reviewer);
    expectCounts(before, 4, 1, 0);
    expect(before).not.toMatch(/Hidden (Pending|Removed|Private|Restricted) Canary/);
    expect(before).not.toContain(pitchBody);
    expect(before).toContain("Visible Expired Fixture");

    expect((await post(`/api/leads/${leadId}/bids/${bidId}/accept`, undefined, buyer)).status).toBe(200);
    // Neither an inconsistent open listing with award markers nor a cross-lead award counts.
    await pool.query(`update leads set deadline_at = null, accepted_bid_id = $2, assigned_user_id = $3
      where author_id = $1 and slug in ('profile-expired', 'profile-no-award')`, [buyer.id, bidId, worker.id]);
    expectCounts(await html(leadsTab), 4, 0, 0);
    expect((await patch(`/api/leads/${leadId}/status`, { action: "complete" }, buyer)).status).toBe(200);
    expect((await patchProfile({ lookingToHire: true }, buyer)).status).toBe(200);
    for (const actor of [undefined, buyer, worker, reviewer]) {
      const completed = await html(leadsTab, actor);
      expect(completed).toContain("Open to hiring");
      expect(completed).not.toContain("Currently hiring");
      expect(completed).not.toContain(pitchBody);
      expect(completed).not.toMatch(/Hidden (Pending|Removed|Private|Restricted) Canary/);
      expect(completed).toContain(ownLeadTitle);
      expectCounts(completed, 4, 0, 1);

      // The client refetch uses this endpoint, not an author/staff-only lead view.
      const response = await request("/api/leads?author=profile-buyer&sort=new&cursor=0", { actor });
      expect(response.status).toBe(200);
      const feedText = await response.text();
      expect(feedText).not.toContain(pitchBody);
      expect(feedText).not.toMatch(/Hidden (Pending|Removed|Private|Restricted) Canary|"(?:acceptedBidId|assignedUserId|reviewNote)"/);
      expect(JSON.parse(feedText)).toMatchObject({ total: 4, items: expect.arrayContaining([
        expect.objectContaining({ id: leadId, engagement: "completed", acceptingBids: false }),
      ]) });
    }
  });
});
