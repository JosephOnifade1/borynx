import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROJECT_LIMITS, type OwnedProject } from "../portfolio-input";

const origin = process.env.BORYNX_PROJECT_TEST_ORIGIN;
const databaseUrl = process.env.BORYNX_PROJECT_TEST_DATABASE_URL;
// Keep this test's write boundary independent of the application's demo-mode policy.
const enabled = /^(?:http:\/\/127\.0\.0\.1):\d+$/.test(origin ?? "") &&
  /^postgresql:\/\/postgres:[a-f0-9]{48}@127\.0\.0\.1:\d+\/borynx_demo_projects$/.test(databaseUrl ?? "");
const endpoint = "/api/me/projects";
type Actor = { id: number; cookie: string; token: string };
type RequestOptions = {
  actor?: Actor; method?: string; json?: unknown; form?: FormData; headers?: Record<string, string>; headerOnly?: boolean;
};

function send(path: string, { actor, method = "GET", json, form, headers, headerOnly }: RequestOptions = {}) {
  return fetch(`${origin}${path}`, {
    method, redirect: "manual", signal: AbortSignal.timeout(30_000), headers: {
      ...(actor && (headerOnly ? { "x-bx-session": actor.token } : { Cookie: actor.cookie })),
      ...(method !== "GET" && { Origin: origin! }), ...(json !== undefined && { "Content-Type": "application/json" }), ...headers,
    },
    body: form ?? (json === undefined ? undefined : JSON.stringify(json)),
  });
}

async function login(username: string): Promise<Actor> {
  const response = await send("/api/auth/login", { method: "POST", json: { username } });
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  expect(cookie).toMatch(/^bx_session=/);
  const data = await response.json();
  return { id: data.user.id, token: data.token, cookie: cookie! };
}

const post = (path: string, json: unknown, actor?: Actor) => send(path, { method: "POST", json, actor });
const patch = (path: string, json: unknown, actor: Actor) => send(path, { method: "PATCH", json, actor });
const remove = (path: string, actor: Actor) => send(path, { method: "DELETE", actor });
const order = (ids: unknown, actor: Actor) => send(`${endpoint}/order`, { method: "PUT", json: { ids }, actor });
const detail = (id: number) => `${endpoint}/${id}`;
const cover = (id: number) => `/api/projects/${id}/cover`;
const mod = (id: number) => `/api/mod/projects/${id}`;
const profile = (username = "projects-owner") => `/f/${username}?tab=projects`;
const fields = (title: string) => ({ title, description: "Refined the keyboard navigation and documented the resulting accessibility checks.", techTags: [" TypeScript ", "a11y", "TYPESCRIPT"] });

async function projectFrom(pending: Promise<Response>, status: number): Promise<OwnedProject> {
  const response = await pending;
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  return (await response.json()).project;
}
const create = (title: string, actor: Actor, extra: Record<string, unknown> = {}) => projectFrom(post(endpoint, { ...fields(title), ...extra }, actor), 201);
const edit = (id: number, json: unknown, actor: Actor) => projectFrom(patch(detail(id), json, actor), 200);

async function owned(actor: Actor): Promise<OwnedProject[]> {
  const response = await send(endpoint, { actor });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  return (await response.json()).items;
}

async function markup(path: string, actor?: Actor) {
  const response = await send(path, { actor });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  return response.text();
}

function expectPublicCount(html: string, count: number) {
  const nav = html.match(/<nav\b[^>]*aria-label="Profile activity"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  expect(nav).toMatch(new RegExp(`Projects<span[^>]*>${count}</span>`));
  expect(nav?.match(/<a\b[^>]*aria-current="page"[^>]*>/)?.[0]).toContain("?tab=projects");
}

function attach(bytes: Buffer, alt = "Example checkout screenshot", mime = "image/png") {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), "cover.png");
  form.set("altText", alt);
  return form;
}
const upload = (id: number, actor: Actor, form: FormData) => send(`${detail(id)}/cover`, { method: "POST", form, actor });

async function imageBytes(path: string, actor?: Actor, headerOnly = false) {
  const response = await send(path, { actor, headerOnly });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/webp");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  return Buffer.from(await response.arrayBuffer());
}

const solid = (background: string) => sharp({ create: { width: 80, height: 40, channels: 3, background } });

describe.skipIf(!enabled)("portfolio projects on disposable PostgreSQL", () => {
  let pool: Pool;
  let owner: Actor;
  let visitor: Actor;
  let reviewer: Actor;
  let curator: Actor;
  let png: Buffer;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
    [owner, visitor, reviewer, curator] = await Promise.all(["projects-owner", "projects-visitor", "projects-reviewer", "projects-cap"].map(login));
    png = await solid("#30c495").withExif({ IFD0: { Artist: "Private Cover Metadata Canary" } }).png().toBuffer();
  });
  afterAll(async () => { await pool?.end(); });

  it("keeps drafts out of visitors’ pages, hover cards and covers until the owner publishes", async () => {
    expect((await send(endpoint)).status).toBe(401);
    expect((await post(endpoint, fields("Guest write"))).status).toBe(401);
    expect((await send("/settings/projects")).headers.get("location")).toMatch(/\/login\?next=\/settings\/projects/);
    expect((await send(endpoint, { method: "POST", actor: owner, json: fields("Cross-origin draft"), headers: { Origin: "https://outside.example.test" } })).status).toBe(403);
    expect((await post(endpoint, { ...fields("Forced publish"), isPublished: true }, owner)).status).toBe(422);
    expect((await post(endpoint, { ...fields("Bad live URL"), liveUrl: "http://studio.example.test" }, owner)).status).toBe(422);
    const item = await create("Private Draft Canary", owner, { liveUrl: "https://studio.example.test/work", roleOutcome: "Led implementation", description: "Documented results and included literal markup <strong>as text</strong>." });
    expect(item).toMatchObject({ isPublished: false, hidden: false, techTags: ["typescript", "a11y"], repoUrl: null, coverUrl: null });
    for (const key of ["userId", "position", "bytes", "hiddenAt", "coverKey", "createdAt"]) expect(item).not.toHaveProperty(key);
    expect((await patch(detail(item.id), { isPublished: true }, visitor)).status).toBe(404);
    expect((await remove(detail(item.id), reviewer)).status).toBe(404);
    expect((await upload(item.id, visitor, attach(png))).status).toBe(404);
    const receipt = await upload(item.id, owner, attach(png, "Private Cover Alt Canary"));
    expect(receipt.status).toBe(200);
    const { coverUrl, altText } = await receipt.json();
    expect(coverUrl).toMatch(new RegExp(`^${cover(item.id)}\\?v=\\d+$`));
    expect(altText).toBe("Private Cover Alt Canary");
    const privateImage = await imageBytes(coverUrl, owner, true);
    expect(await sharp(privateImage).metadata()).toMatchObject({ format: "webp", width: 80, height: 40 });
    expect((await sharp(privateImage).metadata()).exif).toBeUndefined();
    for (const actor of [undefined, visitor, reviewer]) {
      expect((await send(coverUrl, { actor })).status).toBe(404);
      const page = await markup(profile(), actor);
      expectPublicCount(page, 0);
      expect(page).not.toMatch(/Private Draft Canary|Private Cover Alt Canary|Private Portfolio Intake Company/);
    }
    expect(await markup(profile(), owner)).not.toContain(item.title); // owner profile is still the public view
    expect(await markup("/settings/projects", owner)).toContain(item.title);
    expect(await markup("/settings/projects", visitor)).not.toContain(item.title);
    const hover = await send("/api/users/projects-owner", { actor: owner }).then((response) => response.text());
    expect(hover).not.toMatch(/Private Draft Canary|Private Cover Alt Canary|coverUrl|projectCount/);

    expect(await edit(item.id, { isPublished: true }, owner)).toMatchObject({ isPublished: true, coverUrl, hidden: false });
    expect(await imageBytes(coverUrl)).toEqual(privateImage);
    const publicPage = await markup(profile());
    expectPublicCount(publicPage, 1);
    expect(publicPage).toContain(item.title);
    expect(publicPage).toContain("&lt;strong&gt;as text&lt;/strong&gt;");
    expect(publicPage).toContain('href="https://studio.example.test/work"');
    expect(publicPage).toContain(`src="${coverUrl}"`);
    expect(publicPage).toContain('alt="Private Cover Alt Canary"');
    expect(publicPage).not.toContain("Manage projects");
    await edit(item.id, { isPublished: false, liveUrl: null }, owner);
    expect((await send(coverUrl)).status).toBe(404);
    expectPublicCount(await markup(profile()), 0);
    expect((await remove(detail(item.id), owner)).status).toBe(204);
    expect((await send(coverUrl, { actor: owner })).status).toBe(404);
    expect((await pool.query("select project_id from borynx_private.portfolio_project_covers where project_id = $1", [item.id])).rowCount).toBe(0);
  });

  it("enforces six slots under concurrency and an exact, atomic reorder", async () => {
    const foreign = await create("Separate owner work sample", visitor);
    for (let index = 0; index < 5; index++) await create(`Project slot ${index + 1}`, curator);
    const race = await Promise.all([post(endpoint, fields("Concurrent Project A"), curator), post(endpoint, fields("Concurrent Project B"), curator)]);
    expect(race.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await race.find((response) => response.status === 409)!.json()).toMatchObject({ code: "project_limit" });
    const items = await owned(curator);
    expect(items).toHaveLength(6);
    const ids = items.map((item) => item.id).reverse();
    expect((await order(ids.slice(1), curator)).status).toBe(409);
    expect((await order([foreign.id, ...ids.slice(1)], curator)).status).toBe(409);
    expect((await order([ids[1], ...ids.slice(1)], curator)).status).toBe(422);
    const reordered = await order(ids, curator);
    expect(reordered.status).toBe(200);
    expect(((await reordered.json()).items as OwnedProject[]).map((item) => item.id)).toEqual(ids);
    const first = await edit(ids[0], { isPublished: true }, curator);
    const second = await edit(ids[2], { isPublished: true }, curator);
    const publicPage = await markup(profile("projects-cap"));
    expectPublicCount(publicPage, 2);
    expect(publicPage.indexOf(first.title)).toBeLessThan(publicPage.indexOf(second.title));
    expect(publicPage).not.toContain(items.find((item) => item.id === ids[1])!.title);
    expect((await remove(detail(ids[1]), curator)).status).toBe(204);
    expect((await create("Freed project slot", curator)).isPublished).toBe(false);
    expect((await owned(curator)).map((item) => item.id).slice(0, 5)).toEqual(ids.filter((id) => id !== ids[1]));
    await pool.query("update users set is_banned = true where id = $1", [curator.id]);
    try {
      expect((await patch(detail(ids[0]), { isPublished: false }, curator)).status).toBe(403);
      expect(await owned(curator)).toHaveLength(6);
    } finally {
      await pool.query("update users set is_banned = false where id = $1", [curator.id]);
    }
  });

  it("validates and replaces only one cover, leaving the last valid image intact after errors", async () => {
    const item = await create("Cover replacement fixture", owner);
    const response = await upload(item.id, owner, attach(png));
    expect(response.status).toBe(200);
    const original = await imageBytes(cover(item.id), owner);
    expect((await upload(item.id, owner, attach(Buffer.from("invalid PNG")))).status).toBe(422);
    expect((await upload(item.id, owner, attach(png, "a".repeat(PROJECT_LIMITS.altText + 1)))).status).toBe(422);
    expect((await upload(item.id, owner, attach(Buffer.alloc(PROJECT_LIMITS.coverBytes + 1)))).status).toBe(413);
    const chunked = await fetch(`${origin}${detail(item.id)}/cover`, Object.assign({
      method: "POST", signal: AbortSignal.timeout(30_000), headers: {
        Origin: origin!, Cookie: owner.cookie, "Content-Type": "multipart/form-data; boundary=portfolio-test-boundary",
      },
      body: new ReadableStream({ start(controller) {
        for (let i = 0; i < 4; i++) controller.enqueue(new Uint8Array(1024 * 1024));
        controller.close();
      } }),
    }, { duplex: "half" }));
    expect(chunked.status).toBe(413); // even without Content-Length or a parseable form
    const two = attach(png);
    two.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "extra.png");
    expect((await upload(item.id, owner, two)).status).toBe(422);
    expect((await post(`${detail(item.id)}/cover`, {}, owner)).status).toBe(415);
    expect(await imageBytes(cover(item.id), owner)).toEqual(original);
    const nextImage = await solid("#fe941a").jpeg().toBuffer();
    expect((await upload(item.id, owner, attach(nextImage, "Updated view", "image/jpeg"))).status).toBe(200);
    expect(await imageBytes(cover(item.id), owner)).not.toEqual(original);
    const { rows } = await pool.query("select alt_text from borynx_private.portfolio_project_covers where project_id = $1", [item.id]);
    expect(rows).toEqual([{ alt_text: "Updated view" }]);
    expect((await remove(`${detail(item.id)}/cover`, visitor)).status).toBe(404);
    expect((await remove(`${detail(item.id)}/cover`, owner)).status).toBe(204);
    expect((await send(cover(item.id), { actor: owner })).status).toBe(404);
    expect((await owned(owner)).find((p) => p.id === item.id)).toMatchObject({ coverUrl: null, coverAlt: null });
  });

  it("restricts moderation to staff, audits decisions, and cannot restore unpublished content", async () => {
    const item = await create("Moderated Portfolio Sample", owner);
    expect((await patch(mod(item.id), { action: "hide", reason: "Draft is private." }, reviewer)).status).toBe(404);
    expect((await upload(item.id, owner, attach(png))).status).toBe(200);
    await edit(item.id, { isPublished: true }, owner);
    expect(await markup(profile(), reviewer)).toContain("Hide project");
    expect(await markup(profile())).not.toContain("Hide project");
    const hide = { action: "hide", reason: "Review a disclosure on the published card." };
    expect((await patch(mod(item.id), hide, visitor)).status).toBe(403);
    expect((await patch(mod(item.id), { ...hide, reason: " " }, reviewer)).status).toBe(422);
    const hidden = await patch(mod(item.id), hide, reviewer);
    expect(hidden.status).toBe(200);
    expect(await hidden.json()).toEqual({ id: item.id, hidden: true });
    expect((await patch(detail(item.id), { hiddenAt: null }, owner)).status).toBe(422);
    expect(await edit(item.id, { isPublished: true, title: "Hidden Project Edited by Owner" }, owner)).toMatchObject({ hidden: true, isPublished: true });
    for (const actor of [undefined, visitor, reviewer]) {
      expect((await send(cover(item.id), { actor })).status).toBe(404);
      expectPublicCount(await markup(profile(), actor), 0);
    }
    await imageBytes(cover(item.id), owner);
    await edit(item.id, { isPublished: false }, owner);
    const queue = await markup("/mod/queue", reviewer);
    expect(queue).toContain("Hidden portfolio projects");
    expect(queue).toContain("Restore project");
    expect(queue).not.toContain("Hidden Project Edited by Owner");
    const restore = { action: "restore", reason: "Disclosure reviewed." };
    const restored = await patch(mod(item.id), restore, reviewer);
    expect(restored.status).toBe(200);
    expect(await restored.json()).toEqual({ id: item.id, hidden: false });
    expect((await send(cover(item.id))).status).toBe(404);
    expectPublicCount(await markup(profile()), 0);
    await edit(item.id, { isPublished: true }, owner);
    await imageBytes(cover(item.id));
    expect((await remove(detail(item.id), owner)).status).toBe(204);
    const { rows } = await pool.query(`select moderator_id, action, reason from borynx_private.portfolio_project_decisions where project_id = $1 order by id`, [item.id]);
    expect(rows).toEqual([hide, restore].map((decision) => ({ moderator_id: reviewer.id, ...decision })));
  });

  it("links to a bidder’s public projects only in the poster’s private pitch review", async () => {
    const response = await post("/api/leads", {
      title: "Portfolio review lead fixture", description: "We need a checkout accessibility review with a prioritized set of fixes and documented testing steps.",
      kind: "contract", category: "Web & Mobile", budgetMin: 200, budgetMax: 400, budgetUnit: "fixed", currency: "USD",
      skillTags: ["accessibility"], submissionKey: randomUUID(),
    }, visitor);
    expect(response.status).toBe(201);
    const lead = await response.json();
    expect((await patch(`/api/mod/leads/${lead.id}`, { action: "publish", revision: 1 }, reviewer)).status).toBe(200);
    const pitch = "Private Portfolio Review Pitch Canary, with experience testing three checkout flows and reporting changes.";
    expect((await post(`/api/leads/${lead.id}/bids`, { amount: 330, message: pitch }, owner)).status).toBe(201);
    const redirect = await send(lead.href, { actor: visitor });
    expect(redirect.status).toBe(308);
    const canonical = redirect.headers.get("location");
    expect(canonical).toBe(`/l/${lead.id}/portfolio-review-lead-fixture`);
    const posterPage = await markup(canonical!, visitor);
    expect(posterPage).toContain(`href="${profile()}"`);
    expect(posterPage).toContain(pitch);
    for (const actor of [undefined, reviewer]) {
      const visitorPage = await markup(canonical!, actor);
      expect(visitorPage).not.toContain(pitch);
      expect(visitorPage).not.toContain(`href="${profile()}"`);
    }
  });
});
