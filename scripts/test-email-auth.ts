import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { buffer } from "node:stream/consumers";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { AUTH_CALLBACK_PATH, EMAIL_FLOW_COOKIE, EMAIL_SESSION_COOKIE } from "../src/lib/email-auth/policy";
import { fakeSupabaseAuth, testCertificate, TEST_PUBLISHABLE_KEY } from "./fake-supabase-auth";
import { startLocalNext } from "./local-next";
import { freeLoopbackPort, LOOPBACK } from "./local-postgres";

const ORIGIN = "https://borynx-staging.example.test";
const HOST = new URL(ORIGIN).host;
const BAD_LINK = "/login?link=retry";
const fakeIp = (n: number) => `203.0.113.${n}`;
const email = (name: string) => `${name}@example.test`;
const sample = (overrides = {}) => ({
  title: "Build a private pilot analytics dashboard",
  description: "We need a single dashboard with accessibility checks, documented filters, and an export option for our engineers.",
  kind: "contract", category: "Software Engineering", location: "Remote", budgetMin: 700, budgetMax: 900,
  deliveryTimeline: "Two weeks after kickoff",
  budgetUnit: "fixed", currency: "GBP", skillTags: ["typescript", "accessibility"], submissionKey: randomUUID(),
  ...overrides,
});
const cookieValue = (response: Response, name: string) => response.headers.getSetCookie().find((v) => v.startsWith(`${name}=`))?.split(";")[0];
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function checkEmailStaging(url: string, directory: string) {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    await runEmailStaging(pool, url, directory);
  } finally {
    await pool.end();
  }
}

async function runEmailStaging(pool: Pool, url: string, directory: string) {
  const oldToken = randomBytes(32).toString("base64url");
  const legacy = (await pool.query("insert into users (username, display_name, role, karma) values ('buyer', 'Existing Legacy Buyer', 'moderator', 42) returning id")).rows[0];
  await pool.query("insert into sessions (id, user_id, expires_at) values ($1,$2,now() + interval '1 day')", [hash(oldToken), legacy.id]);
  await pool.query("create role anon; create role authenticated; grant select(title) on public.leads to authenticated");

  const tls = testCertificate(directory);
  const port = await freeLoopbackPort();
  const provider = await fakeSupabaseAuth(tls.options, `${ORIGIN}${AUTH_CALLBACK_PATH}`);
  const app = startLocalNext(url, "disabled", ["--hostname", LOOPBACK, "--port", String(port)], false, {
    BORYNX_EMAIL_AUTH: "staging",
    BORYNX_EMAIL_SENDS: "1",
    BORYNX_AUTH_ORIGIN: ORIGIN,
    BORYNX_SUPABASE_URL: provider.origin,
    BORYNX_SUPABASE_PUBLISHABLE_KEY: TEST_PUBLISHABLE_KEY,
    BORYNX_EMAIL_AUTH_SECRET: randomBytes(32).toString("base64url"),
    NODE_EXTRA_CA_CERTS: tls.cert,
  });

  // Node fetch forces Host to the upstream URL. Exercise the canonical Host as a trusted
  // TLS-terminating ingress would carry it to the private loopback app listener.
  const request = (path: string, options: { method?: string; body?: string; headers?: Record<string, string> } = {}) => new Promise<Response>((resolve, reject) => {
    const { method = "GET", body, headers } = options;
    const wire = httpRequest({ hostname: LOOPBACK, port, path, method, signal: AbortSignal.timeout(45_000), headers: {
      Host: HOST, "X-Forwarded-Proto": "https", ...(body && { "Content-Length": Buffer.byteLength(body) }), ...headers,
    } }, async (response) => {
      try {
        const resultHeaders = new Headers();
        for (let i = 0; i < response.rawHeaders.length; i += 2) resultHeaders.append(response.rawHeaders[i], response.rawHeaders[i + 1]);
        const data = await buffer(response);
        resolve(new Response(data.length ? new Uint8Array(data) : null, { status: response.statusCode, headers: resultHeaders }));
      } catch (error) { reject(error); }
    });
    wire.once("error", reject).end(body);
  });
  const post = (path: string, json: object, cookie?: string, ip = fakeIp(1), overrides: Record<string, string> = {}) => request(path, {
    method: "POST", body: JSON.stringify(json), headers: { Origin: ORIGIN, "Content-Type": "application/json", "X-Borynx-Client-Ip": ip, ...(cookie && { Cookie: cookie }), ...overrides },
  });
  const signIn = (address: string, ip: number, next?: string) => post("/api/auth/email", { email: address, next }, undefined, fakeIp(ip));
  const confirm = (intakeId: string, cookie?: string) => post("/api/leads/intake/confirm", { intakeId }, cookie);
  const submitIntake = (body: { lead: object; email: string; displayName: string; companyName?: string }, ip = 1) => post("/api/leads/intake", body, undefined, fakeIp(ip));
  const load = (path: string, cookie?: string) => request(path, cookie ? { headers: { Cookie: cookie } } : {});
  const callback = (code: string, cookie?: string, extras: Record<string, string> = {}) => request(`${AUTH_CALLBACK_PATH}?code=${code}`, {
    headers: { ...(cookie && { Cookie: cookie }), ...extras },
  });
  const me = (cookie?: string) => load("/api/me", cookie).then((r) => r.json());
  const assertAccepted = async (response: Response) => {
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { status: "check_email" });
    assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
    const flow = cookieValue(response, EMAIL_FLOW_COOKIE);
    assert.ok(flow);
    assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly; Secure; SameSite=Lax/i);
    assert.doesNotMatch(response.headers.get("set-cookie") ?? "", /Partitioned|Domain=|__Host-bx_auth=/i);
    return flow;
  };
  const assertRedirect = (response: Response, path?: string) => {
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get("location")!);
    assert.equal(location.origin, ORIGIN);
    if (path) assert.equal(`${location.pathname}${location.search}`, path);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.doesNotMatch(location.href, /@|code=|token=|https?:\/\/outside/i);
    return location;
  };
  const assertSession = (response: Response) => {
    const cookie = cookieValue(response, EMAIL_SESSION_COOKIE);
    assert.ok(cookie);
    assert.match(response.headers.getSetCookie().find((row) => row.startsWith(`${EMAIL_SESSION_COOKIE}=`)) ?? "", /Path=\/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax$/);
    assert.match(response.headers.getSetCookie().find((row) => row.startsWith(`${EMAIL_FLOW_COOKIE}=`)) ?? "", /Max-Age=0/);
    return cookie;
  };
  const count = async (sql: string, params?: unknown[]) => (await pool.query<{ n: number }>(sql, params)).rows[0].n;
  const leadsCount = () => count("select count(*)::int as n from leads");
  const ageLastSends = () => pool.query("update borynx_private.email_auth_sends set attempted_at = least(attempted_at, now() - interval '61 seconds')");

  try {
    const deadline = Date.now() + 60_000;
    while (!app.logs.includes("Ready in")) {
      if (app.child.exitCode !== null || app.child.signalCode !== null || Date.now() > deadline) throw new Error("Email staging app did not start");
      await delay(150);
    }
    // The staged app must never run with default REST-accessible app tables.
    const blocked = await load("/api/health");
    assert.equal(blocked.status, 503);
    assert.deepEqual(await blocked.json(), { ok: false });
    assert.match(app.logs, /requires app-only database access/);
    await pool.query("revoke select(title) on public.leads from authenticated");
    await delay(4200);
    const ready = await load("/api/health");
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { ok: true });
    const loginPage = await load("/login").then((r) => r.text());
    assert.ok(loginPage.includes("Get a sign-in link"), "Canonical host should show email sign-in");
    assert.doesNotMatch(loginPage, /Existing Legacy Buyer|Seeded personas|__bxDemoMode|sb_publishable_/);
    assert.equal((await post("/api/auth/login", { username: "buyer" })).status, 404);
    const legacyTransports: Record<string, string>[] = [{ Cookie: `bx_session=${oldToken}` }, { "x-bx-session": oldToken }, { Authorization: `Bearer ${oldToken}` }, { Cookie: `${EMAIL_SESSION_COOKIE}=${oldToken}` }];
    for (const headers of legacyTransports) {
      assert.deepEqual(await request("/api/me", { headers }).then((r) => r.json()), { user: null, transport: "none" });
    }
    assert.equal((await post("/api/leads", sample())).status, 401);
    assert.equal((await post("/api/auth/email", { email: email("bad-origin") }, undefined, fakeIp(1), { Origin: "https://other.example.test" })).status, 403);
    assert.equal((await post("/api/auth/email", { email: email("bad-host") }, undefined, fakeIp(1), { Host: "outside.test", "X-Forwarded-Host": HOST })).status, 403);
    assert.equal((await post("/api/auth/email", { email: email("bad-ip") }, undefined, "", { "X-Forwarded-For": fakeIp(1) })).status, 503);
    assert.equal((await post("/api/auth/email", { email: email("bad-type") }, undefined, fakeIp(1), { "Content-Type": "text/plain" })).status, 415);
    assert.equal((await post("/api/auth/email", { email: "x".repeat(3000) })).status, 413);
    assert.equal((await signIn("a@", 1)).status, 422);

    await pool.query("insert into spaces (slug, name) values ('pilot-briefs', 'Pilot briefs')");
    const buyer = email("buyer");
    const body = {
      lead: sample({ description: "We need a reporting dashboard for synthetic tests. A fictional example says 'guaranteed income' and is only here for the reviewer queue check.", spaceSlug: "pilot-briefs" }),
      email: "  Buyer@EXAMPLE.test  ", displayName: "Staging Test Buyer", companyName: "Private Pilot Company",
    };
    assert.equal((await submitIntake({ ...body, displayName: "X" })).status, 422);
    assert.equal((await submitIntake({ ...body, lead: { ...body.lead, deliveryTimeline: undefined } })).status, 422);
    assert.equal((await submitIntake({ ...body, lead: { ...body.lead, budgetMin: 10 } })).status, 422);
    assert.equal((await submitIntake({ ...body, lead: { ...body.lead, description: "For guaranteed income, wire transfer upfront. You must pay the processing fee to receive your fictional assignment." } })).status, 422);
    assert.equal((await submitIntake({ ...body, lead: { ...body.lead, spaceSlug: "nonexistent" } })).status, 422);
    assert.equal(await count("select count(*)::int as n from borynx_private.lead_intakes"), 0);
    assert.equal(provider.attempts.length, 0);

    const newRetries = await Promise.all([submitIntake(body), submitIntake(body), submitIntake(body)]);
    assert.deepEqual(newRetries.map((r) => r.status).sort(), [202, 429, 429]);
    assert.equal(provider.attempts.length, 1);
    const flow = await assertAccepted(newRetries.find((r) => r.status === 202)!);
    const intake = (await pool.query("select id, email_hash, ip_hash, expires_at - created_at as lifetime from borynx_private.lead_intakes")).rows[0];
    assert.match(intake.email_hash, /^[a-f0-9]{64}$/);
    assert.notEqual(intake.email_hash, hash(buyer));
    assert.match(intake.ip_hash, /^[a-f0-9]{64}$/);
    assert.equal(intake.lifetime.days, 1);
    assert.equal(await leadsCount(), 0);
    assert.equal(await count("select count(*)::int as n from reports"), 0);
    assert.equal(await count("select count(*)::int as n from borynx_private.auth_identities"), 0);
    assert.equal((await signIn(buyer, 2)).status, 429); // login and intake share the send budget
    const retryAfter = Number(newRetries.find((r) => r.status === 429)!.headers.get("retry-after"));
    assert.ok(retryAfter >= 1 && retryAfter <= 60);

    const location = `/l/new?intake=${intake.id}`;
    const anonymousReview = await load(location);
    assert.doesNotMatch(await anonymousReview.text(), /Build a private pilot analytics dashboard|Private Pilot Company/);
    assert.match(anonymousReview.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(anonymousReview.headers.get("referrer-policy"), "no-referrer");
    assert.equal((await confirm(intake.id)).status, 401);
    const mail = provider.latest(buyer);
    assertRedirect(await callback(mail.code), BAD_LINK);
    const [payload, signature] = flow.split(".");
    assertRedirect(await callback(mail.code, `${payload}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`), BAD_LINK);
    assert.equal((await request(`${AUTH_CALLBACK_PATH}?code=${mail.code}`, { method: "HEAD", headers: { Cookie: flow } })).status, 204);
    assert.equal((await callback(mail.code, flow, { "Sec-Purpose": "prefetch" })).status, 204);
    assert.equal(provider.exchanges, 0);
    const auth = await callback(mail.code, flow);
    assertRedirect(auth, location);
    const buyerSession = assertSession(auth);
    assert.equal(await auth.text(), "");
    assert.equal(provider.lookups, 1);
    assertRedirect(await callback(mail.code, flow), BAD_LINK);
    assert.equal((await me(buyerSession)).user.displayName, body.displayName);
    const publicAccount = (await me(buyerSession)).user;
    assert.notEqual(publicAccount.id, legacy.id);
    assert.equal(publicAccount.role, "member");
    assert.equal(publicAccount.isVerified, false);
    assert.match(publicAccount.username, /^member-[0-9a-f]{24}$/);
    assert.equal("email" in publicAccount || "companyName" in publicAccount || "subject" in publicAccount, false);
    assert.doesNotMatch(await load(`/api/users/${publicAccount.username}`).then((r) => r.text()), /Private Pilot Company|buyer@example\.test|"subject"/);
    const [saved] = (await pool.query("select company_name, display_name from public.users where id = $1", [publicAccount.id])).rows;
    assert.deepEqual(saved, { company_name: body.companyName, display_name: body.displayName });
    // The account can opt into hiring without publishing an intake-only company name.
    const intent = await request("/api/me", { method: "PATCH", body: JSON.stringify({ lookingToHire: true }), headers: {
      Origin: ORIGIN, Cookie: buyerSession, "Content-Type": "application/json",
    } });
    assert.equal(intent.status, 200);
    const intentAccount = (await intent.json()).user;
    assert.equal(intentAccount.lookingToHire, true);
    assert.equal(intentAccount.companyName, null);
    const profileHref = `/f/${publicAccount.username}`;
    const visitorProfile = await load(profileHref).then((r) => r.text());
    assert.match(visitorProfile, /Open to hiring/);
    for (const path of [profileHref, "/settings"]) {
      const ownerPage = await load(path, buyerSession);
      assert.equal(ownerPage.status, 200);
      const markup = await ownerPage.text();
      assert.match(markup, /Edit Profile/);
      assert.doesNotMatch(markup, /Private Pilot Company|buyer@example\.test|synthetic-refresh|synthetic-access/);
    }
    assert.doesNotMatch(visitorProfile, /Private Pilot Company|buyer@example\.test/);
    const sessionRow = (await pool.query("select id, intake_id, auth_identity_id from public.sessions where user_id = $1", [publicAccount.id])).rows[0];
    assert.equal(sessionRow.id, hash(buyerSession.slice(EMAIL_SESSION_COOKIE.length + 1)));
    assert.equal(sessionRow.intake_id, intake.id);
    assert.ok(sessionRow.auth_identity_id);
    assert.equal((await request("/api/me", { headers: { "x-bx-session": buyerSession.slice(EMAIL_SESSION_COOKIE.length + 1) } }).then((r) => r.json())).user, null);
    assert.equal((await request("/api/me", { headers: { Cookie: buyerSession, Host: "other.example.test" } }).then((r) => r.json())).user, null);
    assert.equal((await post("/api/me/verify", { githubUrl: "https://github.com/pilot-test" }, buyerSession)).status, 404);
    assert.equal((await post("/api/auth/logout", {}, buyerSession, fakeIp(1), { Origin: "https://other.example.test" })).status, 403);
    const review = await load(location, buyerSession).then((r) => r.text());
    assert.match(review, /Build a private pilot analytics dashboard/);
    assert.match(review, /Submit for review/);
    assert.doesNotMatch(review, /Private Pilot Company|buyer@example\.test|synthetic-refresh|synthetic-access|sb_publishable_/);
    assert.equal(await leadsCount(), 0); // callback and page reads don't write leads or reports
    assert.equal(await count("select count(*)::int as n from borynx_private.lead_intakes where consumed_at is not null"), 0);
    assert.equal((await request("/api/leads/intake/confirm", { headers: { Cookie: buyerSession } })).status, 405);

    // Even the same verified mailbox needs the original exact intake context, not just an email session.
    await ageLastSends();
    const plainFlow = await assertAccepted(await signIn(buyer, 3, "/settings"));
    const plainAuth = await callback(provider.latest(buyer).code, plainFlow);
    assertRedirect(plainAuth, "/settings");
    const plainSession = assertSession(plainAuth);
    assert.equal((await me(plainSession)).user.id, publicAccount.id);
    assert.equal((await confirm(intake.id, plainSession)).status, 404);
    assert.doesNotMatch(await load(location, plainSession).then((r) => r.text()), /Build a private pilot analytics dashboard/);
    assert.equal((await confirm(randomUUID(), buyerSession)).status, 404);
    assert.equal((await post("/api/leads/intake/confirm", { intakeId: intake.id }, buyerSession, fakeIp(1), { Origin: "https://other.example.test" })).status, 403);

    const observer = email("observer");
    const observerFlow = await assertAccepted(await signIn(observer, 2, "//outside.example.test"));
    const observerAuth = await callback(provider.latest(observer).code, observerFlow);
    assertRedirect(observerAuth, "/");
    const observerSession = assertSession(observerAuth);
    assert.equal((await confirm(intake.id, observerSession)).status, 404);
    assert.doesNotMatch(await load(location, observerSession).then((r) => r.text()), /Build a private pilot analytics dashboard/);

    await pool.query("update users set is_banned = true where id = $1", [publicAccount.id]);
    assert.equal((await confirm(intake.id, buyerSession)).status, 403);
    assert.equal((await post("/api/leads", sample(), buyerSession)).status, 403);
    await pool.query("update users set is_banned = false where id = $1", [publicAccount.id]);
    await pool.query("update spaces set privacy = 'private' where slug = 'pilot-briefs'");
    assert.equal((await confirm(intake.id, buyerSession)).status, 422);
    assert.equal(await leadsCount(), 0);
    await pool.query("update spaces set privacy = 'public' where slug = 'pilot-briefs'");
    const submissions = await Promise.all([confirm(intake.id, buyerSession), confirm(intake.id, buyerSession), confirm(intake.id, buyerSession)]);
    assert.deepEqual(submissions.map((r) => r.status).sort(), [200, 200, 201]);
    const committed = await submissions[0].json();
    for (const response of submissions.slice(1)) assert.deepEqual(await response.json(), committed);
    assert.equal(committed.publicationStatus, "pending_review");
    assert.equal(await count("select count(*)::int as n from leads where author_id = $1 and published_at is null", [publicAccount.id]), 1);
    assert.equal(await count("select count(*)::int as n from reports where target_id = $1 and reason = 'automated_filter'", [committed.id]), 1);
    assert.equal(await count("select count(*)::int as n from borynx_private.lead_intakes where lead_id = $1 and consumed_at is not null and brief is null and display_name is null and company_name is null", [committed.id]), 1);
    assert.match(await load(location, buyerSession).then((r) => r.text()), /You already submitted this brief/);
    assert.equal((await confirm(intake.id, observerSession)).status, 404);
    const retries = provider.attempts.length;
    assert.equal((await submitIntake(body)).status, 202);
    assert.equal(provider.attempts.length, retries);
    for (const endpoint of ["/api/leads", "/api/search?q=private+pilot+analytics", committed.href]) {
      assert.doesNotMatch(await load(endpoint).then((r) => r.text()), /Build a private pilot analytics dashboard|Private Pilot Company/);
    }
    assert.equal((await load(committed.href, observerSession)).status, 404);
    assert.match(await load(committed.href, buyerSession).then((r) => r.text()), /Build a private pilot analytics dashboard/);
    assert.equal((await post("/api/leads", body.lead, buyerSession)).status, 200); // shared key with the signed-in path
    console.log("PASS staging denies unsafe grants, demo login, URL-only verification, CSRF and token fallback; enrols a distinct member with no private data in public responses");
    const reviewPath = `/api/mod/leads/${committed.id}`;
    const reviewWrite = (cookie: string) => request(reviewPath, {
      method: "PATCH", body: JSON.stringify({ action: "publish", revision: 1 }),
      headers: { Cookie: cookie, Origin: ORIGIN, "Content-Type": "application/json" },
    });
    assert.equal((await reviewWrite(buyerSession)).status, 403);
    const observerId = (await me(observerSession)).user.id;
    await pool.query("update users set role = 'moderator' where id = $1", [observerId]); // assign synthetic reviewer after verification
    const queue = await load("/mod/queue", observerSession);
    assert.equal(queue.status, 200);
    assert.match(await queue.text(), /Build a private pilot analytics dashboard/);
    const published = await reviewWrite(observerSession);
    assert.equal(published.status, 200);
    assert.equal((await published.json()).publicationStatus, "published");
    assert.match(await load("/api/leads").then((r) => r.text()), /Build a private pilot analytics dashboard/);
    console.log("PASS exact-browser PKCE, wrong account/context, one pending lead under concurrency, report filing, and manual review before publication");

    const returning = { ...body, lead: sample({ title: "Unsubmitted returning draft should expire" }), displayName: "Do Not Overwrite Profile", companyName: "Ignored Company" };
    await ageLastSends();
    const returnFlow = await assertAccepted(await submitIntake(returning));
    const returnCode = provider.latest(buyer).code;
    const returningAuth = await callback(returnCode, `${returnFlow}; ${buyerSession}`);
    const returningId = assertRedirect(returningAuth).searchParams.get("intake")!;
    assert.ok(returningId && returningId !== intake.id);
    const returningSession = assertSession(returningAuth);
    assert.equal((await me(buyerSession)).user, null); // old session rotated
    assert.equal((await me(returningSession)).user.id, publicAccount.id);
    assert.equal((await me(returningSession)).user.displayName, body.displayName);
    const storedCompany = (await pool.query("select company_name from users where id = $1", [publicAccount.id])).rows[0];
    assert.equal(storedCompany.company_name, body.companyName);
    assert.equal((await confirm(intake.id, returningSession)).status, 404);
    assert.equal((await confirm(returningId, plainSession)).status, 404);
    assert.equal((await submitIntake({ ...body, email: email("third"), lead: sample() })).status, 429); // two new drafts/IP, no resend exemption for new drafts
    await ageLastSends();
    assert.equal((await signIn(buyer, 7)).status, 429); // third send was accepted, fourth blocked across IPs
    assert.deepEqual(provider.attempts.filter((address) => address === buyer).length, 3);

    const blockedIntake = await confirm(returningId, returningSession);
    assert.equal(blockedIntake.status, 409);
    assert.equal((await blockedIntake.json()).code, "active_lead_limit");
    assert.equal(await count("select count(*)::int as n from borynx_private.lead_intakes where id=$1 and brief is not null and consumed_at is null", [returningId]), 1);

    await pool.query("update borynx_private.lead_intakes set created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' where id = $1", [returningId]);
    assert.equal((await confirm(returningId, returningSession)).status, 410);
    assert.equal((await confirm(returningId, observerSession)).status, 404);
    assert.match(await load(`/l/new?intake=${returningId}`, returningSession).then((r) => r.text()), /Unsubmitted drafts expire after 24 hours/);
    assert.doesNotMatch(await load(`/l/new?intake=${returningId}`, returningSession).then((r) => r.text()), /Unsubmitted returning draft should expire/);
    const activeLimit = await post("/api/leads", sample(), returningSession);
    assert.equal(activeLimit.status, 409);
    assert.equal((await activeLimit.json()).code, "active_lead_limit");
    const closeLead = (id: number, action: string) => request(`/api/leads/${id}/status`, {
      method: "PATCH", body: JSON.stringify({ action }), headers: { Cookie: returningSession, Origin: ORIGIN, "Content-Type": "application/json" },
    });
    assert.equal((await closeLead(committed.id, "close_without_hire")).status, 200);
    const nextLead = await post("/api/leads", sample(), returningSession);
    assert.equal(nextLead.status, 201);
    assert.equal((await closeLead((await nextLead.json()).id, "withdraw")).status, 200);
    assert.equal((await post("/api/leads", sample(), returningSession)).status, 429);

    const raceEmail = email("quota-race");
    const intakeBrief = sample({ title: "Check concurrency when confirming a saved brief" });
    const directBrief = sample({ title: "Check concurrency from the signed-in lead form" });
    const raceFlow = await assertAccepted(await submitIntake({ lead: intakeBrief, email: raceEmail, displayName: "Quota Race Buyer" }, 31));
    const raceAuth = await callback(provider.latest(raceEmail).code, raceFlow);
    const raceIntakeId = assertRedirect(raceAuth).searchParams.get("intake")!;
    const raceSession = assertSession(raceAuth);
    const userId = (await me(raceSession)).user.id;
    const [intakeWrite, directWrite] = await Promise.all([confirm(raceIntakeId, raceSession), post("/api/leads", directBrief, raceSession)]);
    assert.deepEqual([intakeWrite.status, directWrite.status].sort(), [201, 409]);
    const confirmedFirst = intakeWrite.status === 201;
    const [success, denied] = confirmedFirst ? [intakeWrite, directWrite] : [directWrite, intakeWrite];
    const savedLead = await success.json();
    assert.equal(savedLead.publicationStatus, "pending_review");
    assert.equal((await denied.json()).code, "active_lead_limit");
    assert.equal(await count("select count(*)::int as n from leads where author_id=$1", [userId]), 1);
    const repeat = await post("/api/leads", confirmedFirst ? intakeBrief : directBrief, raceSession);
    assert.equal(repeat.status, 200);
    assert.deepEqual(await repeat.json(), savedLead);
    const boundDraft = (await pool.query("select lead_id, brief is null as scrubbed, consumed_at is not null as consumed from borynx_private.lead_intakes where id=$1", [raceIntakeId])).rows[0];
    assert.deepEqual(boundDraft, { lead_id: confirmedFirst ? savedLead.id : null, scrubbed: confirmedFirst, consumed: confirmedFirst });
    console.log("PASS direct submission and a different verified intake share one active slot, preserving retries and the losing draft");

    // Provider failure keeps the draft and reservation. A later retry cannot replace its payload.
    const failedEmail = email("failed");
    const failure = { lead: sample({ title: "Keep this original draft after a delivery failure" }), email: failedEmail, displayName: "Pilot Staging" };
    provider.failed.add(failedEmail);
    const failed = await submitIntake(failure, 50);
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get("set-cookie"), null);
    assert.doesNotMatch(await failed.text(), /synthetic sender failure|example\.test/);
    assert.equal((await submitIntake(failure, 50)).status, 429);
    provider.failed.delete(failedEmail);
    await ageLastSends();
    const recovered = await assertAccepted(await submitIntake({ ...failure, lead: { ...failure.lead, title: "This replacement title should not be saved" } }, 50));
    const failedMail = provider.latest(failedEmail);
    const recoveryRow = (await pool.query("select id, brief->>'title' as title from borynx_private.lead_intakes where submission_key = $1", [failure.lead.submissionKey])).rows[0];
    assert.equal(recoveryRow.title, failure.lead.title);
    failedMail.expiresAt = 0;
    assertRedirect(await callback(failedMail.code, recovered), BAD_LINK); // provider expiry
    assert.equal(await count("select count(*)::int as n from borynx_private.auth_identities where email = $1", [failedEmail]), 0);
    const other = email("not-confirmed");
    const otherFlow = await assertAccepted(await signIn(other, 51));
    provider.accounts.get(other)!.email_confirmed_at = null;
    assertRedirect(await callback(provider.latest(other).code, otherFlow), BAD_LINK);
    const mismatchEmail = email("mismatch");
    const mismatch = await assertAccepted(await signIn(mismatchEmail, 52));
    provider.accounts.get(mismatchEmail)!.email = email("different");
    assertRedirect(await callback(provider.latest(mismatchEmail).code, mismatch), BAD_LINK);
    const knownDenial = email("denied");
    provider.denied.add(knownDenial);
    await assertAccepted(await signIn(knownDenial, 53)); // no provider-specific enumeration
    assert.deepEqual(provider.errors, []);
    console.log("PASS returning profiles unchanged, owned expiry vs wrong-account 404, send recovery, provider expiry/recipient proof and shared limits");

    await pool.query("update borynx_private.lead_intakes set created_at = now() - interval '49 hours', expires_at = now() - interval '25 hours' where id = $1", [recoveryRow.id]);
    await pool.query("insert into borynx_private.email_auth_sends (email_hash, ip_hash, attempted_at) values ('old','old',now() - interval '25 hours')");
    execFileSync(process.execPath, ["--import", "tsx", "scripts/prune-email-intakes.ts"], { env: { ...process.env, BORYNX_DEMO_MODE: "0", DATABASE_URL: url }, stdio: "pipe" });
    assert.equal(await count("select count(*)::int as n from borynx_private.lead_intakes where id = $1 and brief is null and display_name is null and company_name is null", [returningId]), 1);
    assert.equal(await count("select count(*)::int as n from borynx_private.lead_intakes where id = $1", [recoveryRow.id]), 0);
    assert.equal(await count("select count(*)::int as n from borynx_private.email_auth_sends where email_hash = 'old'"), 0);
    assert.equal((await confirm(returningId, returningSession)).status, 410);

    // Even if the private schema or old session table got granted by mistake, no browser-role RLS policy exists.
    const connection = await pool.connect();
    try {
      await connection.query("begin; grant usage on schema borynx_private to anon; grant select on all tables in schema borynx_private to anon; grant select on public.sessions to anon; set local role anon");
      for (const table of ["borynx_private.auth_identities", "borynx_private.lead_intakes", "borynx_private.email_auth_sends", "public.sessions"]) {
        assert.deepEqual((await connection.query(`select * from ${table}`)).rows, []);
      }
    } finally {
      await connection.query("rollback");
      connection.release();
    }

    await pool.query("truncate borynx_private.email_auth_sends");
    const ips = await Promise.all(Array.from({ length: 8 }, (_, index) => signIn(email(`ip-rate-${index}`), 80)));
    assert.deepEqual(ips.map((r) => r.status).sort(), [202, 202, 202, 202, 202, 202, 429, 429]);
    await pool.query("insert into borynx_private.email_auth_sends (email_hash, ip_hash) select 'global-' || n, 'global-' || n from generate_series(1,23) n");
    const global = await Promise.all(Array.from({ length: 4 }, (_, index) => signIn(email(`global-rate-${index}`), 90 + index)));
    assert.deepEqual(global.map((r) => r.status).sort(), [202, 429, 429, 429]);
    assert.equal(await count("select count(*)::int as n from borynx_private.email_auth_sends"), 30);
    assert.equal(provider.attempts.filter((address) => address.startsWith("global-rate-")).length, 1);
    console.log("PASS time-bounded retention, private database rows, and concurrent per-IP/global send budgets");
    const logout = await post("/api/auth/logout", {}, returningSession);
    assert.equal(logout.status, 200);
    assert.match(logout.headers.getSetCookie().find((row) => row.startsWith(`${EMAIL_SESSION_COOKIE}=`)) ?? "", /Max-Age=0/);
    assert.equal((await me(returningSession)).user, null);
    assert.doesNotMatch(app.logs, new RegExp(`${mail.code}|${returnCode}|synthetic-refresh|Private Pilot Company|sb_publishable_`));
    assert.deepEqual(provider.errors, []);
  } catch (error) {
    console.error(app.logs);
    throw error;
  } finally {
    await Promise.all([app.stop(), provider.stop()]);
  }
}
