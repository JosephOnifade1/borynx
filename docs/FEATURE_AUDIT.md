# Borynx feature audit

- **Audited revision:** `b36f3c9aaca070f7fc0c40194552052c7c6928ca`
- **Coverage:** 24 page routes, 50 API route files, shared UI and background logic, and 15 database migrations. This is an audit of the checked-in application, not a report on the live site's uptime or settings.

[Ratings](#ratings) · [Features, best to worst](#feature-inventory) · [Test results](#test-results) · [All pages](#page-index) · [All APIs](#api-index)

> **Update before merge:** A [follow-up on `main`](https://github.com/JosephOnifade1/borynx/commit/e5f9c06a718514fa11de4b4fd0039289d6b44795) fixed the launcher’s rejection of remote databases in explicitly opted-in existing-account mode. A synthetic URL passed the updated launcher check; no database connection was attempted. The separate demo preview sign-in guard still disagrees with its tests. Unless noted, the audit results below are from the revision above.

## Bottom line

- **The core product works in local tests.** People can browse and publish threads, reply and follow other people, maintain profiles and portfolios, and run the free marketplace flow from lead submission and moderation through private pitches, award, kickoff, completion, and an eligible buyer review.
- **The biggest user-facing gaps are in community membership and reputation.** The private-space invite button does not send a request, members can be stuck in a private space, and vote totals, karma, and solution rankings can disagree. The notification inbox can also lose visible history when the bell refreshes.
- **Email and paid pilots are not live-proven.** Passwordless email was exercised with a local stand-in for Supabase. The two optional paid services were tested with their switches on and off. The site does not process payments or hold escrow.
- **The test suite is not green as shipped.** The preserved development override disagrees with the expected sign-in boundary. It fails eight unit cases and stops the normal database test command. Running the remaining suites separately verified the marketplace and profile workflows; that does not erase the guard failure.

### What I would fix first

| Order | Finding | What should change |
| --- | --- | --- |
| 1 — Before exposing any development preview | **Existing-account demo sign-in does not enforce the preview restriction the tests expect.** In isolated preview checks, the app displayed the account picker and issued a demo session where the tests expected a denial. This is a development-mode finding, not evidence of a live production bypass. | Keep handle-only sign-in confined to isolated test data and agree on one explicit runtime, launcher, and test policy. The [repository instructions](../AGENTS.md) protect the existing local override; this audit did not change it. |
| 2 — Community access | **Private invite and leave flows don't work for regular members.** The page also exposes the room's details even when its threads are hidden. | Decide which details should be public, then support real requests/grants/revocation and allow a member to leave. Until then, don't present “Request invite” as a working workflow. Also make the roster write enforce the same suspension check as the page. |
| 3 — Trust in rankings | **Voting and solution counters can give the wrong reputation.** A normal vote undo changed karma; ranking refetches can omit the top person; public solver counts can reflect private answers. | Make karma changes reversible, update the solved state on moderation, and use one visibility-aware ranking query for both the page and its API. |
| 4 — Reliability | **Bell refresh drops inbox history; `b/new` can be claimed as a space name; referrals don't credit later signup.** | Separate the bell and inbox data, reserve site paths during creation, and either complete signup attribution or describe it as landing-only tracking. |

## Ratings

| Rating | What it means |
| --- | --- |
| **5 — Working locally** | The main flow passed a browser, HTTP/database, or automated check on disposable data. This is not a guarantee for every browser, load level, or deployment. |
| **4 — Partly working** | The feature works in ordinary cases but has an observed problem, a documented implementation gap, or an inconsistent edge case. |
| **3 — Demo or opt-in** | Implemented but intentionally restricted or off by default. The table says what was tested when enabled. Being off is not a bug. |
| **2 — Not fully verified** | Present in code or documented operationally, but the stated behavior was not independently exercised in those conditions. Not the same as broken. |
| **1 — Broken or missing** | A specific action fails, or the advertised/requested capability has no working path in this repository. Missing items are separated from confirmed failures. |

**Evidence labels:** **Browser** = interacted with the running site in Chromium; **HTTP/DB** = exercised the running app or inspected resulting rows on disposable PostgreSQL; **Unit** = automated logic checks; **Code** = traced the implementation, not a claim of end-to-end execution. A page loading does not prove every control on it works.

## Feature inventory

### 5 — Working locally

#### Navigation, reading, and community

| Feature | What works and what proves it |
| --- | --- |
| Site shell, theme and navigation | **Browser:** desktop navigation collapsed, opened on hover and was pinned open again; light/dark choice survived reload. Mobile navigation and the shell rendered at 390 px and 320 px. Account menu and sign-out worked in the email rehearsal. **Code:** signed-in sidebar lists joined spaces and moderation links; guests see popular spaces; role-specific account links, system theme fallback, toast/status messages, skeletons, and error regions are wired. |
| Home and community feeds | **HTTP/DB + Unit:** guests can read All Threads; members can switch to Following, which returned only posts by followed authors. The site has space, author, solved and saved views, Hot (votes, discussion and age), Best (confidence-weighted votes), and New. **Code:** first page is server-rendered; later pages use a virtualized list and scroll-to-load; thread results are limited to a 400-candidate window. |
| Jump to… search | **Browser + HTTP/DB:** `Ctrl/⌘+K`, title search and Enter opened the thread. Searches return spaces, freelancer handles/names, public leads and visible thread titles, up to five of each; private threads were excluded for a nonmember. **Code:** shortcut list, arrow-key navigation and Esc. This is quick title/name search, not full-text search of replies or briefs. |
| Permalinks and old links | **HTTP/DB:** short `/p/[postId]` redirected to the community URL, old space and user aliases resolved, and a bare lead ID opened the canonical lead slug. Missing and inaccessible records behaved as expected. Existing thread slugs survive an edit; imported lead slugs and shareable filter links work. `proxy.ts` also normalizes legacy prefixes. |
| Community directory, pages and ordinary creation | **HTTP/DB:** created public, restricted and private rooms and rendered their space pages and directory entries. **Code:** builder has name, generated/editable URL slug, tagline, description, color preview, topics, rules, and privacy choice; creator becomes owner; existing names and database aliases are checked. Space pages show rules, moderators, and member count; directory shows joined state and seven-day activity. See the slug and count exceptions below. |
| Public and restricted space membership | **HTTP/DB:** a member could join and leave both kinds. Restricted threads were readable but a nonmember could not start one; the restriction is on starting threads, not reading or replying to them. Owners cannot leave via the membership toggle. |
| Private thread access | **HTTP/DB:** nonmembers could not open or search for the private fixture thread; authorized membership allowed reading. Private thread/tombstone cases also passed the thread-author suite. This covers thread content, not the room's public listing or its aggregate activity. |
| Context panels | **HTTP/DB + Code:** public feeds and page-specific author/space/rules panels rendered. The shared rail shows public trending communities, current open public leads, verified solvers, and platform rules. Solver totals have a visibility flaw listed below. |
| Thread publishing and rendering | **Browser + Unit:** published a formatted Help thread at 390 px and saw its bold body. The app supports Discussion, Resource, Help wanted and Showcase, with a rich editor for bold, italic, headings, lists, quotes, links, inline code and code blocks. Serializer/renderer tests cover safe links, pasted content and older Markdown. Feed cards show excerpts and a host/path link preview; `b/space`, `f/user` and legacy `u/user` references link to the right pages. |
| Author editing and deletion | **HTTP/DB:** the author could edit without changing the permalink or replies. Deleting replaces title/body with a neutral “deleted by its author” page, keeps existing discussion, locks new replies, and removes the post from discovery. Deletion did not reopen a moderator removal. This is not a user-facing hard delete. |
| Comments and replies | **HTTP/DB:** first-level and nested replies were stored with the right parent; reading stayed tied to the thread's access rules. **Code:** Markdown toolbar and preview, reply counts, vote controls, removed-comment placeholders; accepted answers are ordered first. |
| Votes and accepting an answer | **HTTP/DB + Unit:** post, comment and lead votes could be set or changed; tally changes persisted. The thread author accepted and revoked an answer, which changed the solved state and granted/reversed 50 karma. Staff authority and solution replacement are implemented. The button shown to a space-only moderator, removal of a solved answer, and 1.5× thread karma have separate problems below. |

#### Profiles, network, and bookmarks

| Feature | What works and what proves it |
| --- | --- |
| Public profiles and hover cards | **HTTP/DB:** profile, canonical handle, public posts and Solved (threads that person posted and resolved), Leads, Projects and Reviews tabs exist. A visitor's profile/hover counters omit inaccessible threads and answers. **Code:** public cards show bio, headline, initials/avatar color, skills, GitHub/portfolio links, joined date, follower count, achievement shelf and verification mark; hover card has a follow control and badges. |
| Edit profile and settings | **HTTP/DB + Unit:** authenticated profile updates, validation and field clearing work. Owner can edit display name, bio, headline, skills, avatar hue, GitHub/portfolio links, and marketplace preferences via the profile or `/settings`. A handle, role or verification badge is not editable as a profile field. |
| Hire and work from one account | **HTTP/DB:** all four combinations of “Open to hiring” and “Available for work” worked. Company name/website and hourly rate are optional; intake-only company name stays out of public data and the profile editor unless explicitly supplied there. Rate uses USD/EUR/GBP. Public lead counts and hiring-first layout follow published activity; these switches don't grant a role or prevent pitching. |
| Follow/unfollow and Following | **HTTP/DB:** a follow produced a notification and changed the Following feed; unfollow worked. Public follower/following counts and viewer-specific follow state are available through the API. There is no public list of follower accounts or messaging system. |
| Achievements and badges | **HTTP/DB + Unit:** progress page and account badge shelf rendered; First Solve was awarded by a real solution action. The catalogue is **Verified Pro**, **First Post**, **Rising Voice** (ten threads with 5+ net votes), **Trusted Voice** (500 karma), **Top Solver** (five answers), **First Solve**, **Deal Maker** (three published leads), **Networker** (five memberships), and **Conversationalist** (25 comments). **Code:** badges are rechecked after relevant actions/on visit; they are milestones, not redeemable balances. |
| Portfolio drafts and public work samples | **HTTP/DB + Unit:** owner can create, edit, delete, publish/unpublish and reorder up to six projects; concurrency and ordering rules were tested. Projects carry description, role/outcome, tech tags, optional live/repo links, and a cover. Drafts are private. Published, visible work samples link from public profiles and from the buyer's private pitch review. |
| Portfolio covers and staff moderation | **HTTP/DB + Unit:** upload, replace/remove, preview own draft cover, and serve public cover only for eligible projects. Still JPEG/PNG/WebP images are validated and converted to WebP; bad replacements don't erase the previous image. Site staff can hide/restore a published project with a reason and an audit record; owner edits cannot undo a staff hide. |
| Saved threads and leads | **HTTP/DB + Browser:** separate `/saved` tabs, private thread save toggles, and idempotent lead save/remove. The 320 px browser opened a saved lead. Lead saves are ordered by time saved; closed public leads can remain saved and labeled unavailable, while hidden/removed ones drop from discovery and saved results. No account can read someone else's saved items. |
| In-app notification delivery and read state | **HTTP/DB + Browser:** follows, nested replies, accepted solutions, pitches, awards, kickoff and lead-publication decisions have in-app notification paths. Recipient checks, unread counts, single item read and Mark all read worked; the mobile inbox switched to its empty Unread view after clearing. Bell polls (about 30 seconds) and inbox polls, not push delivery. Bell history and click behavior are rated separately. |
| Attributed links and landing capture | **Browser + Code:** thread and lead actions generate an attributed link with a clipboard/manual copy path. A link visit was recorded, and attribution parameters disappeared from the address bar. This proves landing capture, not signup conversion, rewards or analytics. |

#### Free lead marketplace

| Feature | What works and what proves it |
| --- | --- |
| Browse lead board and details | **Browser + HTTP/DB:** filtered board at 320 px opened a lead, and the detail fit the width. Cards/detail show discipline, contract/bounty/role, author, brief, budget/unit, location, timeline, skills, deadline, verification, pitch count and distinct engagement states when present. Search, profiles, related listings and the context rail respect publication eligibility. An unpublished or otherwise ineligible lead is not publicly discoverable. |
| Filters, rankings and paging | **HTTP/DB + Unit:** New filters support category, type, verified listing, open/accepting pitches, currency, fixed/hourly, overlapping budget range and any selected normalized skill. Budget amount filters require currency and unit. Hot and Best are intentionally unfiltered and rank a bounded set; New uses exact cursor paging, including past 400 results. Same filter contract serves first render and API. Invalid filters/cursors error instead of silently showing unrelated items. |
| Draft a lead, validate, submit and retry | **HTTP/DB + Unit:** guests can draft without publishing; browser-local draft restoration and sign-in return are wired, and verified or demo members can submit. New briefs need a scope, positive budget range, minimums for contracts, fixed/hourly unit, supported currency (USD/EUR/GBP), timeline, 1–6 catalogue skills, and a future deadline if provided; optional linked space must be public. The one-active-lead limit spans both direct and email submissions, and a retry of the same draft returns the original lead rather than consuming another slot. |
| Publication review and corrections | **HTTP/DB:** owners see their submission history and current status; queued/rejected/changes-requested details are private to authorized viewers. Staff can publish the current revision, ask for changes, or reject with a reason; cannot review their own lead or publish a withdrawn/stale/removed one. Owner can edit and resubmit a correctable brief or withdraw it before publication. Dismissing a content report is not publication. |
| Quick apply and private pitches | **HTTP/DB:** sign-in return and `#bid` links point to the pitch section. A signed-in nonowner can send a quote and message for an eligible open lead. Deadline, duplicate, self-pitch and rate checks worked. The bidder can see their own pitch; only the poster sees the full private list, including links to bidder work samples. Public pitch counts do not reveal quote or message. |
| Award and close the engagement | **HTTP/DB:** author can pick a single winning pitch even with competing requests, and the winner gets a private in-app notice. Close without hire, mark awarded work complete, or cancel after award; those outcomes are terminal and distinct. Expired leads stop taking new pitches; legacy awaiting-review pitches can still be chosen when eligible. New awards and completion add no karma. Completion is a buyer record, not Borynx verification of work or payment. |
| Private award kickoff | **HTTP/DB + Unit:** after a valid award the buyer can send one note, contact instruction and start date to the confirmed winner. Only those two can see the details; the winner can acknowledge once, without changing the public Awarded state. No edit, resend or staff read access. Completion, cancellation and lead removal erase the details and related kickoff notices. |
| Verified engagement reviews and public ratings | **HTTP/DB + Unit:** buyer can leave one 1–5-star review with plain-text testimonial on a matching, public, completed award. Legacy/ambiguous, self, cancelled, private or unfinished engagements cannot count. Profile Reviews tab and API page results; rating uses only the latest eligible review per distinct buyer and appears from three distinct buyers. This is evidence that an eligible buyer submitted the review, not proof of work quality or payment. |
| Review reports, decisions and staff signals | **HTTP/DB:** reviews can be held for screening, published, hidden or restored by eligible site staff with reasons. Participants can't moderate their own review. A report on a review only affects that review. Staff advisory signals flag patterns such as rapid completion, reciprocal awards and near-duplicate review text; they don't automatically hide a review, penalize an account or surface to the public. |

#### Moderation and site operations

| Feature | What works and what proves it |
| --- | --- |
| Reports and content screening | **HTTP/DB + Unit:** post, comment, lead and review report paths exist, with reason and optional details. The rule-based screen can block risky text or queue a flagged post/comment/lead for human review; flagged reviews have a hold state. Report approval hides/removes the target, dismissal doesn't publish or change the content. Appropriate roles, already-decided cases, target-type isolation and linked-space visibility were checked. This is a rules screen plus human review, not automatic verification of claims. |
| Site-wide and space moderation queues | **HTTP/DB:** guests cannot open the queues and a space owner can handle their own space's reports. **Code:** space queue has pending reports, report evidence, moderator roster and recent removals; `/mod/queue` has status tabs/counts, lead publication, held/hidden reviews, hidden projects, restricted accounts and recent audit actions. Author-edited/deleted post evidence can remain with a report for moderators. Roster and solution limitations appear below. |
| Site staff discipline and manual verification | **HTTP/DB:** a site admin could warn, suspend by duration, unban, ban, unban and manually verify a test account; actions appeared in the database audit log. A space-only owner was denied those site-wide actions. The server prevents self-discipline and limits who may act on admins. Professional verification is staff-managed, independent of email sign-in. |
| Action limits and retry safety | **HTTP/DB + Unit + Code:** concurrency verified for lead and pitch submissions, awards, kickoff, reviews, portfolio slots, and sponsorship. The app also has per-user time-window checks for new threads, replies, reports, leads and bids; it can return wait guidance. The numerical policy is in [`safety.ts`](../src/lib/safety.ts), and enforcement is in [`services.ts`](../src/lib/services.ts) and the individual handlers. This is not a load or abuse-resistance certification. |
| Database initialization, upgrades and readiness | **HTTP/DB:** fresh schema, legacy upgrades, ledger mismatch rejection, rollback/resume and representative private table grants passed on disposable databases. Normal startup and `npm run db:migrate` use the verified Drizzle journal. `/api/health` is a minimal ready/not-ready check; normal `/status` hides internals. Database-offline fallback rendered without public migration details. |

### 4 — Partly working

| Feature | Gap | Evidence |
| --- | --- | --- |
| Leaderboard / talent directory | Karma, Most Solved, Most Followed, Newest, verified-only and skill filters exist. The server page sorts before limiting, but API-driven sorting/filtering first chooses an unordered subset (40 by default), then ranks it. A valid top result can disappear on refetch. | **HTTP/DB:** the highest-karma fixture appeared on the server-rendered page and was absent from the API's top 40. [Page](../src/app/leaderboard/page.tsx), [API](../src/app/api/leaderboard/route.ts). |
| Public solver and activity totals | Profile and hover counters obey access rules; leaderboard and Verified Solvers rail can count private/removed answers. The private space's directory entry exposes activity totals, and the room description/rules/roster are not member-only. A “private” room currently means private threads, not an unlisted room. | **HTTP/DB:** a private answer changed the guest leaderboard count while the guest profile/hover count stayed zero and the thread stayed hidden. **Code:** [directory](../src/app/b/page.tsx), [space page](../src/app/b/%5Bslug%5D/page.tsx), [rail](../src/components/shell/ContextRail.tsx). |
| Vote undo and karma ledger | Discussion/showcase and comment/lead votes have ordinary tally changes; Help and Resource apply a 1.5× multiplier. Rounding each change separately can leave a karma balance change after the vote is undone. | **HTTP/DB:** upvote → undo on a Help thread restored its vote total but left the author with +1 karma. [`karma.ts`](../src/lib/karma.ts), [`services.ts`](../src/lib/services.ts). |
| Solution moderation | The UI offers a space moderator an Accept solution action the server reserves for the thread author and site staff. Also, removing a previously accepted answer does not clear the Solved flag. | **Code + HTTP/DB:** space-only actor got a denial; approving a comment report left the thread solved and the hidden comment marked as the solution. [Comment UI](../src/components/post/CommentThread.tsx), [report decision](../src/app/api/mod/reports/%5Bid%5D/route.ts). |
| Space moderator roster and member count | Promotion/demotion works, but promotion of a nonmember creates membership without increasing the displayed count. Join membership and counter writes are also separate, so concurrent updates can drift. The roster mutation checks moderator role but lacks the suspension check present on the page. | **HTTP/DB:** one promotion left the displayed count at 1 with 2 membership rows. **Code:** [join](../src/app/api/spaces/%5Bslug%5D/join/route.ts), [roster mutation](../src/app/api/spaces/%5Bslug%5D/moderators/route.ts); suspension mismatch was source-reviewed. |
| Temporary suspension expiry | Server sign-in and write guards can recognize that a suspension ended, while some controls, profile labels and directory filters still look only at the stored restricted flag. | **HTTP/DB + Code:** an expired-suspension test account signed in before the preview assertion; the [public user state](../src/lib/auth.ts), [vote UI](../src/components/feed/controls.tsx), and [leaderboard filter](../src/app/api/leaderboard/route.ts) do not all use the same expiry logic. The UI edge was source-reviewed. |
| Notification bell and inbox history | Bell fetches 10 and inbox fetches 60 into the same cache. Refreshing the bell can replace inbox history with the smaller list. Clicking a bell item leaves it unread, unlike opening it in the inbox; there is no older-history paging. | **Browser:** a 15-item fixture fell to 10 on opening the bell, and following a bell item left it unread. [Bell](../src/components/shell/NotificationBell.tsx), [inbox](../src/components/notifications/NotificationsInbox.tsx). |
| Referrals / signup attribution | Landings and already-signed-in visitors can be recorded; an anonymous visitor who signs up later is not linked back by the email signup flow. No referral dashboard or payouts were found. | **Browser + HTTP/DB:** a landing row was created and stayed unconverted after a successful fake-provider email signup. [Capture](../src/components/providers.tsx), [API](../src/app/api/referrals/route.ts). |
| Older API limit validation | The leaderboard and notification lists behave with normal limits, but accept a negative page limit rather than validating it. Lead discovery has stricter validation. | **HTTP/DB:** both older routes returned 200 on a negative limit in the isolated app. This does not measure capacity or behavior under load. |

### 3 — Demo or opt-in

| Feature | What is available, and when |
| --- | --- |
| Disposable demo and five personas | **HTTP/DB:** `npm run dev:demo` starts a separate throwaway DB with fictional buyer, two bidders, reviewer and observer. Fresh demo boot, sample lead permalink, role boundaries, hashed sessions, cookie/header transports and guest-write denial passed. Demo data isn't seeded by ordinary `npm run dev`. The account picker is not a public login. |
| Existing local test account picker | **HTTP/DB:** loopback sign-in and sign-out worked with a pre-existing test account and its original role when run through plain `npm run dev`; the launch log showed demo seeding disabled. The restored-account test also created a private draft. **Caveat:** the preview guard still disagrees with the test expectation. The separate remote-launcher failure was fixed after this audit; see the update above. |
| Cookie/header and tab-only demo fallback | **HTTP/DB + Code:** the disposable demo resolved its cookie and alternate header transports; loopback sign-out was exercised separately using a pre-existing test account. The UI can use session storage or fall back to memory when storage is unavailable; tab-only fallback and third-party cookie policies were not exhaustively browser-tested. The email session does not use this transport. |
| Demo-only URL verification and diagnostic status | **Code + HTTP/DB:** GitHub profile URL entry can set the badge in a demo, without proving GitHub ownership; the URL-only endpoint was confirmed unavailable with email auth. Demo `/status` has database/table and ledger/session details that the normal page does not expose. |
| Email link sign-in and first-time accounts | **Browser + HTTP/DB:** off in the sample configuration; implemented for an explicitly configured HTTPS staging host. The local provider double proved email request, same-browser one-time proof, first-time/returning account behavior, safe return destination, secure cookie, sign-out, expired/wrong-context rejection and shared send limits. New sends can be paused independently of sessions. Email proves mailbox access, not freelancer credentials. Hosted delivery wasn't checked. |
| Email-verified guest lead intake | **HTTP/DB:** guest can save a private brief, verify email in the same browser, then explicitly confirm submission. The callback itself does not publish or submit. Tests covered retries, wrong account/browser, expiry, retained draft on a lost active-slot race, and no duplicate lead. An unsubmitted draft expires after 24 hours; consumed details are scrubbed. [`db:prune-email`](../scripts/prune-email-intakes.ts) was tested against disposable data, not scheduled on a live host. |
| Assisted Hire | **HTTP/DB:** `BORYNX_ASSISTED_HIRE` is off by default. In the enabled rehearsal an eligible published lead owner with a verified email session could consent and request the ₦25,000 manual shortlist service. The offer is 2–3 available, budget-fit candidates within two Lagos weekdays after confirmation, not a hire guarantee. The app tracks the request; people operate the service outside it. |
| Sponsored leads | **HTTP/DB:** `BORYNX_SPONSORED_LEADS` is off by default and there is no default fee. With an approved whole-naira fee in configuration, one clearly labeled eligible placement can be reserved for up to seven days. It respects board filters and is separate from organic order, counts and karma. Tests covered eligibility, concurrent reservation, refund, and removal from the board when switched off. |
| Buyer service tracking and admin operations | **HTTP/DB:** owner-only view of own requests; a separate verified admin can confirm an externally verified payment, record Assisted Hire delivery, decline an unconfirmed request or record an external refund. Cannot handle one's own order. Enabling requires the staged email setup; switching flags off hides new offers/placements, not all history/reconciliation for existing requests. There is no money movement through these controls. |

### 2 — Not fully verified

| Feature / environment | What remains to verify |
| --- | --- |
| Live deployment, hosted email, database and paid operations | No hosted Supabase project, SMTP/deliverability, Neon connection, production configuration, proxy trust, grant setup, pilot enablement/payment, real shortlist delivery, or live migration was tested. Local tests support the implementation, not a launch decision. No hosted services or customer data were modified. |
| Keyboard and accessibility details beyond the smoke test | Palette keyboard use, focusable controls and responsive views were sampled. **Code:** dialogs manage focus/Esc, feed has `J`/`K`/Enter and Esc, reduced-motion styles, loading placeholders and retry/error states. Screen readers, full keyboard-only use and every dialog/error branch were not certified. |
| Browser and scale coverage | Chromium desktop and two mobile widths passed representative flows. Safari/Firefox, mobile OS keyboards, every clipboard or storage fallback, slow networks, high traffic and a real deployment remain unverified. Do not treat local scrolling, throttling, or fixture concurrency checks as a performance benchmark. |

### 1 — Broken or missing

| Feature | Finding |
| --- | --- |
| **Broken — private invite requests** | “Request invite” made a normal join request and returned “This space is invite-only” to a signed-in regular account, in the 390 px browser and HTTP. No request approval or ordinary-member invitation UI/API was found. A moderator promotion granting membership is not an invite flow. |
| **Broken — leaving a private space** | A regular user with an existing private membership got the same denial; the join/leave handler rejects them before checking that membership. Removing their moderator designation leaves the membership in place. Private thread access still worked for legitimate members. |
| **Broken — community named `new`** | Creation accepted `new` as the slug, but `/b/new` showed the builder instead of the new community. Normal slugs worked. The route name needs reserving before creation. |
| **Broken — existing-account preview boundary as specified by tests** | With the protected opt-in override on, a simulated forwarded preview got the existing-account picker when the stock runner expected “Sign-in is unavailable.” The standalone local-demo check also received a successful session response instead of the expected 404 in a forwarded-preview fixture. Eight guard tests disagreed with the runtime. This is specific to dev/test existing-account mode, not the production email flow or the five-persona demo. See [`demo-mode.ts`](../src/lib/demo-mode.ts), [picker check](../scripts/test-database.ts#L385) and [session check](../scripts/test-database.ts#L447). |
| **Historical — remote DB launcher rejection (fixed after the audit)** | At the audited revision, the runtime accepted the opt-in but [`planDevLaunch`](../scripts/dev-launch.ts) rejected remote URLs. The follow-up on `main` resolved this specific rejection: the updated launcher accepted the synthetic Neon URL and still used a loopback listener. No hosted connection was tested. |
| **Missing — real GitHub OAuth** | The badge copy mentions GitHub OAuth, but there is no OAuth sign-in/ownership flow. The working features are profile links and staff vetting; URL-based demo verification is intentionally not proof. |
| **Missing — pin/unpin management** | Thread rows and ranking honor stored pin flags, but no author/moderator pin action or write route was found. |
| **Missing — karma milestone alert producer** | The inbox renders a `karma_milestone` type, but no runtime producer was found. Badge progress and awarding are separate and do work. |
| **Not built — member editing/deleting their own comments; community maintenance** | No comment-author edit/delete, self-service space rename/settings editor, ownership transfer, or general member removal UI/API was found. Thread-owner edit/delete and moderator report removal are different features and work. |
| **Not built — payments and chat** | No checkout, in-app refunds or payouts, escrow, freelancer billing, or direct messaging. `isEscrowed` is legacy/demo data, not a funds service. A pitch, a private kickoff note and manually tracked pilot payments are narrower features. |

## Test results

All executions used throwaway databases and synthetic accounts. The browser ran against a local production build with a fake HTTPS email provider. Role-gated routes were checked with appropriate local sessions; real email request/confirmation was not assumed from just setting those sessions.

| Check | Outcome on this revision |
| --- | --- |
| Build, lint, TypeScript, migration consistency | `npm run build`, `npm run lint`, `npm run typecheck`, and `npx --no-install drizzle-kit check` passed. The build had the pilot/email switches off and no live database attached. |
| `npm test` | **269 passed, 8 failed**, all failures in [`demo-mode.test.ts`](../src/lib/__tests__/demo-mode.test.ts). **47** HTTP integration cases were skipped by design in unit-only mode. The same counts were verified against the merge candidate with the newer launcher. |
| Stock `npm run test:db` | Passed early upgrade/ledger/offline checks and fresh demo boot, then **8 HTTP cases** (5 lead publication, 3 thread author). Stopped at the existing-account forwarded-preview assertion; do not count the stock command as passed. |
| `npm run test:db -- --local-demo-only` | Loopback login, original account/role, cookie and logout worked; the command **failed** the forwarded-preview login check (200 instead of the expected 404). Same existing-account issue, separate assertion. |
| Remaining tests run independently | **39 more HTTP cases passed**: engagement **4**, profiles **4**, portfolio **5**, discovery/saves **8**, reviews **8**, kickoff **5**, buyer pilot **5** (enabled and disabled). Together with the initial 8, all **47 HTTP cases** were exercised across the runs. The continuation was a temporary runner outside the checkout, not a source or test change. |
| Extra database and provider scenarios | Fake-provider email, legacy upgrade and private grant checks ran separately: browser-bound email proof, account safety, retry/expiry/retention, shared send budgets, intake/direct one-active-lead race, and migration `0014` pilot state. Representative upgrades from old schemas preserved original threads, leads, bid/award evidence, profile data, saves and historical karma without fabricating new reviews or kickoff content. |
| Route and browser smoke | **24/24** page routes matched their expected render/redirect on fixtures. **19/19 custom checkpoints** passed at 1280×820, 390×844 and 320×568 and over local HTTP/DB; some checkpoints intentionally confirm the defects above. No browser page errors in the sampled flows. |

Reference entry points: [test runner](../scripts/test-database.ts), [email rehearsal](../scripts/test-email-auth.ts), [database runbook](LOCAL_DATABASE.md), [migration journal](../drizzle/meta/_journal.json), and [pilot runbook](MONETIZATION_PILOT.md). No application, test, migration, or protected environment files were changed for this audit.

## Page index

These are **all 24 page files**. Route labels show the usual URL; the source link shows the exact App Router file. `5 + 3`, for example, means the core page works locally and an optional feature is gated.

| Page | Who it's for | Rating and purpose |
| --- | --- | --- |
| [`/`](../src/app/page.tsx) | Everyone | **5** — introduction, All Threads and signed-in Following feed, composer entry, ranking and context panels. |
| [`/achievements`](../src/app/achievements/page.tsx) | Signed-in member | **5 + 3** — badge catalogue, numbers and progress; demo-only link verification form. |
| [`/b`](../src/app/b/page.tsx) | Everyone | **5 + 4** — directory with counts and joined state; private room details are discoverable. |
| [`/b/new`](../src/app/b/new/page.tsx) | Signed-in creator | **4** — space builder works for ordinary slugs; clashes with a space actually named `new`. |
| [`/b/[slug]`](../src/app/b/%5Bslug%5D/page.tsx) | Everyone; member or staff for private threads | **4** — space feed/rules/roster, public/restricted membership works; private request/leave does not. |
| [`/b/[slug]/mod`](../src/app/b/%5Bslug%5D/mod/page.tsx) | Space owner/moderator or site staff | **4** — space queue, report evidence, removals and roster; membership/guard issues in roster mutations. |
| [`/b/[slug]/submit`](../src/app/b/%5Bslug%5D/submit/page.tsx) | Eligible signed-in author | **5** — rich thread composer, space access and publishing. |
| [`/b/[slug]/p/[postId]/[title-slug]`](../src/app/b/%5Bslug%5D/p/%5BpostId%5D/%5B%5B...rest%5D%5D/page.tsx) | Visible to authorized readers; signed-in actions | **5 + 4** — thread, nested discussion, votes, solutions, sharing, save, report, author controls and removed/deleted states; known solution/karma defects. |
| [`/f/[username]`](../src/app/f/%5Busername%5D/page.tsx) | Everyone; owner and staff extras | **5** — public profile, Posts/Solved/Leads/Projects/Reviews, follow, owner editor and staff discipline. |
| [`/l`](../src/app/l/page.tsx) | Everyone | **5 + 3** — lead board, URL filters, ranking modes, saved leads access and optional sponsored placement. |
| [`/l/new`](../src/app/l/new/page.tsx) | Guests drafting, eligible users submitting | **5 + 3** — draft, own submissions and active limit; optional email intake/confirmation view. |
| [`/l/[leadId]/[title-slug]`](../src/app/l/%5BleadId%5D/%5B%5B...rest%5D%5D/page.tsx) | Public, or owner/staff for unpublished leads | **5 + 3** — brief, canonical redirects, owner correction/withdrawal and private pitch/award/kickoff/review actions; optional service request. |
| [`/leaderboard`](../src/app/leaderboard/page.tsx) | Everyone | **4** — talent cards, rankings and filters; ranking subset and solver visibility bugs. |
| [`/login`](../src/app/login/page.tsx) | Signed-out visitors in enabled modes | **3 + 1** — staged email, optional demo picker or sign-in unavailable; existing-account dev preview guard mismatch. |
| [`/me`](../src/app/me/page.tsx) | Account shortcut | **5** — redirects to your profile if signed in, sign-in otherwise. |
| [`/me/lead-services`](../src/app/me/lead-services/page.tsx) | Verified buyer; admin-only operations panel | **3** — own pilot order history and separate operations queue. |
| [`/mod/queue`](../src/app/mod/queue/page.tsx) | Site moderators/admins | **5** — site-wide reports, publication decisions, projects/reviews, signals, discipline/audit and link to pilot operations for eligible admin. |
| [`/notifications`](../src/app/notifications/page.tsx) | Signed-in member | **4** — private All/Unread inbox and read actions; shared bell cache can truncate history. |
| [`/p/[postId]`](../src/app/p/%5BpostId%5D/page.tsx) | Authorized thread reader | **5** — short route redirects to the scoped canonical permalink, including deletion handling. |
| [`/p/[postId]/edit`](../src/app/p/%5BpostId%5D/edit/page.tsx) | Eligible thread author | **5** — edit published thread through the same composer, respecting removal and privacy. |
| [`/saved`](../src/app/saved/page.tsx) | Signed-in owner of saves | **5** — separate Threads and Leads libraries. |
| [`/settings`](../src/app/settings/page.tsx) | Signed-in account owner | **5** — profile, preferences and link to manage work samples. |
| [`/settings/projects`](../src/app/settings/projects/page.tsx) | Signed-in project owner | **5** — project library, drafts/publication, display order, covers and deletion. |
| [`/status`](../src/app/status/page.tsx) | Everyone; extra diagnostics only in demo | **5 + 3** — public status or demo DB/runtime view. |

Also checked outside the 24: the [legacy URL proxy](../src/proxy.ts), [not-found](../src/app/not-found.tsx) view, [database-offline](../src/components/DatabaseOffline.tsx) view, [route](../src/app/error.tsx) and [global](../src/app/global-error.tsx) error fallbacks, and [route-specific privacy headers](../next.config.ts). Redirect, not-found and database-readiness cases were exercised; the two general error boundaries were code-reviewed.

## API index

These are **all 50 API route files**. Methods are the explicitly implemented ones; implicit framework responses are not separate features. Ratings apply to the named behavior. Private reads such as pitch lists and service orders are rendered only for the authorized viewer on their pages, so those do not have a separate public GET route.

### Access, people, and utility

| API route | Methods | Rating | Feature |
| --- | --- | --- | --- |
| [`/api/auth/callback`](../src/app/api/auth/callback/route.ts) | HEAD, GET | **3** | Provider return: HEAD/prefetch does not redeem a link; GET verifies and starts a staged email session. |
| [`/api/auth/email`](../src/app/api/auth/email/route.ts) | POST | **3** | Request a short-lived sign-in link when staged sending is enabled. |
| [`/api/auth/login`](../src/app/api/auth/login/route.ts) | POST | **3 + 1** | Demo handle sign-in only. Ordinary fixture mode worked; existing-account preview check disagrees with the override. |
| [`/api/auth/logout`](../src/app/api/auth/logout/route.ts) | POST | **5** | End the current session and clear its cookies; email logout worked in Chromium. |
| [`/api/health`](../src/app/api/health/route.ts) | GET | **5** | Public readiness probe: minimal 200/503 response. |
| [`/api/leaderboard`](../src/app/api/leaderboard/route.ts) | GET | **4** | Rank and filter talent; query can miss top performers and counts inaccessible answers. |
| [`/api/me`](../src/app/api/me/route.ts) | GET, PATCH | **5** | GET probes current session/transport; PATCH validates and updates own profile. |
| [`/api/me/verify`](../src/app/api/me/verify/route.ts) | POST | **3** | Demo URL-only badge, not OAuth and not email verification. |
| [`/api/referrals`](../src/app/api/referrals/route.ts) | POST | **4** | Log an attributed landing; no subsequent email-signup conversion. |
| [`/api/search`](../src/app/api/search/route.ts) | GET | **5** | Search visible thread titles and public lead titles plus spaces and people; space names can be public even for private rooms. |
| [`/api/users/[username]`](../src/app/api/users/%5Busername%5D/route.ts) | GET | **5** | Public profile/hover payload with viewer-aware counts and badges. |
| [`/api/users/[username]/follow`](../src/app/api/users/%5Busername%5D/follow/route.ts) | GET, POST | **5** | Follow/follower counts and viewer state; toggle follow and notify subject. |
| [`/api/users/[username]/reviews`](../src/app/api/users/%5Busername%5D/reviews/route.ts) | GET | **5** | Public eligible testimonials and cursor paging; buyer-weighted rating summary. |

### Communities, threads, and notifications

| API route | Methods | Rating | Feature |
| --- | --- | --- | --- |
| [`/api/comments/[id]/solution`](../src/app/api/comments/%5Bid%5D/solution/route.ts) | POST | **4** | Set, replace or revoke an accepted answer; space-only moderator UI mismatch and stale state after removal. |
| [`/api/comments/[id]/vote`](../src/app/api/comments/%5Bid%5D/vote/route.ts) | POST | **5** | Set or clear a vote on a visible live comment. |
| [`/api/notifications`](../src/app/api/notifications/route.ts) | GET | **4** | Current account's in-app feed and unread count; older limit validation and shared bell cache caveats. |
| [`/api/notifications/read`](../src/app/api/notifications/read/route.ts) | POST | **5** | Mark selected or all of the user's notifications read. |
| [`/api/posts`](../src/app/api/posts/route.ts) | GET, POST | **5** | List/rank/filter accessible threads or publish a new thread as an eligible member. |
| [`/api/posts/[id]`](../src/app/api/posts/%5Bid%5D/route.ts) | PATCH, DELETE | **5** | Author edit or author-delete with a discussion tombstone. |
| [`/api/posts/[id]/comments`](../src/app/api/posts/%5Bid%5D/comments/route.ts) | GET, POST | **5** | Read replies or post a top-level/nested reply while the thread is open. |
| [`/api/posts/[id]/save`](../src/app/api/posts/%5Bid%5D/save/route.ts) | POST | **5** | Toggle own thread bookmark. |
| [`/api/posts/[id]/vote`](../src/app/api/posts/%5Bid%5D/vote/route.ts) | POST | **4** | Set/change/clear vote; 1.5× karma may not revert cleanly. |
| [`/api/reports`](../src/app/api/reports/route.ts) | POST | **5** | Report eligible post, comment, lead or review with reason/details. |
| [`/api/spaces`](../src/app/api/spaces/route.ts) | GET, POST | **4** | List communities or create as a signed-in actor; metadata is public and `new` isn't reserved. |
| [`/api/spaces/[slug]/join`](../src/app/api/spaces/%5Bslug%5D/join/route.ts) | POST | **4** | Join/leave public or restricted; private “Request invite” and regular-member leave fail. |
| [`/api/spaces/[slug]/moderators`](../src/app/api/spaces/%5Bslug%5D/moderators/route.ts) | POST | **4** | Promote/demote by handle; membership count and actor suspension check need attention. |

### Lead discovery, submissions, and hiring

| API route | Methods | Rating | Feature |
| --- | --- | --- | --- |
| [`/api/leads`](../src/app/api/leads/route.ts) | GET, POST | **5** | Public filtered/cursor results; submit validated brief to private review with retry and active-lead limits. |
| [`/api/leads/[id]`](../src/app/api/leads/%5Bid%5D/route.ts) | PATCH | **5** | Author corrects a changes-requested brief and submits a new review revision. |
| [`/api/leads/[id]/bids`](../src/app/api/leads/%5Bid%5D/bids/route.ts) | POST | **5** | Submit own private quote/pitch to an eligible lead. |
| [`/api/leads/[id]/bids/[bidId]/accept`](../src/app/api/leads/%5Bid%5D/bids/%5BbidId%5D/accept/route.ts) | POST | **5** | Buyer awards one matching pitch; private award notice. |
| [`/api/leads/[id]/kickoff`](../src/app/api/leads/%5Bid%5D/kickoff/route.ts) | POST, PATCH | **5** | Buyer sends one private handoff; winner acknowledges it. |
| [`/api/leads/[id]/review`](../src/app/api/leads/%5Bid%5D/review/route.ts) | POST | **5** | Buyer submits one review for an eligible completed engagement. |
| [`/api/leads/[id]/save`](../src/app/api/leads/%5Bid%5D/save/route.ts) | PUT, DELETE | **5** | Add/remove own lead bookmark idempotently. |
| [`/api/leads/[id]/services`](../src/app/api/leads/%5Bid%5D/services/route.ts) | POST | **3** | Verified, consenting buyer requests an enabled service on an eligible lead. |
| [`/api/leads/[id]/status`](../src/app/api/leads/%5Bid%5D/status/route.ts) | PATCH | **5** | Author withdraws, closes without hire, completes or cancels as allowed by state. |
| [`/api/leads/[id]/vote`](../src/app/api/leads/%5Bid%5D/vote/route.ts) | POST | **5** | Set or clear vote on a public lead; doesn't determine award or placement. |
| [`/api/leads/intake`](../src/app/api/leads/intake/route.ts) | POST | **3** | Save private guest brief linked to a staged email request. |
| [`/api/leads/intake/confirm`](../src/app/api/leads/intake/confirm/route.ts) | POST | **3** | Verified same-browser intake owner explicitly confirms the draft for review. |
| [`/api/me/saved-leads`](../src/app/api/me/saved-leads/route.ts) | GET | **5** | Current account's saved leads with private cursor pagination. |

### Portfolio and moderation

| API route | Methods | Rating | Feature |
| --- | --- | --- | --- |
| [`/api/me/projects`](../src/app/api/me/projects/route.ts) | GET, POST | **5** | List own projects (including drafts) or create a draft. |
| [`/api/me/projects/[id]`](../src/app/api/me/projects/%5Bid%5D/route.ts) | PATCH, DELETE | **5** | Owner updates, publishes/unpublishes or deletes a project. |
| [`/api/me/projects/[id]/cover`](../src/app/api/me/projects/%5Bid%5D/cover/route.ts) | POST, DELETE | **5** | Owner validates/uploads/replaces/removes a project cover. |
| [`/api/me/projects/order`](../src/app/api/me/projects/order/route.ts) | PUT | **5** | Save an exact order of the owner's project IDs atomically. |
| [`/api/projects/[id]/cover`](../src/app/api/projects/%5Bid%5D/cover/route.ts) | GET | **5** | Serve a public eligible WebP or the owner's private preview. |
| [`/api/mod/lead-reviews/[id]`](../src/app/api/mod/lead-reviews/%5Bid%5D/route.ts) | PATCH | **5** | Site staff publish/hide/restore reviews with reasons and conflict checks. |
| [`/api/mod/lead-services/[id]`](../src/app/api/mod/lead-services/%5Bid%5D/route.ts) | PATCH | **3** | Verified admin records external payment, delivery, decline or refund; no self-handling. |
| [`/api/mod/leads/[id]`](../src/app/api/mod/leads/%5Bid%5D/route.ts) | PATCH | **5** | Site reviewer publishes, requests changes or rejects the current lead revision. |
| [`/api/mod/projects/[id]`](../src/app/api/mod/projects/%5Bid%5D/route.ts) | PATCH | **5** | Site staff hide/restore a project with reason and audit entry. |
| [`/api/mod/reports/[id]`](../src/app/api/mod/reports/%5Bid%5D/route.ts) | PATCH | **5** | Authorized moderator approves/dismisses report; approval handles the target, not lead publication. |
| [`/api/mod/users/[id]`](../src/app/api/mod/users/%5Bid%5D/route.ts) | PATCH | **5** | Site staff warn, suspend, ban, unban or verify an account; audit log. |
