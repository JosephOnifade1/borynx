# Borynx: phase-by-phase marketplace implementation plan

**Status: Phases 0–1 merged; Phase 2 implemented for development.** See the [local database runbook](./LOCAL_DATABASE.md), [Phase 1 walkthrough](./MARKETPLACE_PHASE_1.md), and [Phase 2 walkthrough](./MARKETPLACE_PHASE_2.md). Phases 3–6 remain proposals. The audit below describes the original checkout at `11e1195`.

## What the repository already gives us

| Existing code | What the plan must account for |
|---|---|
| [`src/db/schema.ts`](../src/db/schema.ts), [`bootstrap.ts`](../src/db/bootstrap.ts), `drizzle/` | Drizzle over PostgreSQL. `leads.authorId` is required; anonymous drafts should not weaken that. Boot currently migrates and seeds; separate demo fixtures from real environments. |
| [`/login`](../src/app/login/page.tsx), [`POST /api/auth/login`](../src/app/api/auth/login/route.ts), [`src/lib/auth.ts`](../src/lib/auth.ts) | A handle alone can obtain a demo session. The existing actor/session boundary is reusable, but the demo endpoint and preview header transport must not reach real users. The app does not currently have email verification or provider identities. |
| [`/l/new`](../src/app/l/new/page.tsx), [`POST /api/leads`](../src/app/api/leads/route.ts), [`/mod/queue`](../src/app/mod/queue/page.tsx) | Guests are redirected before drafting. Submission screens content, but an allowed flagged lead can already be public. **Approve report** removes content; it is not approval to publish a lead. |
| [Accept handler](../src/app/api/leads/%5Bid%5D/bids/%5BbidId%5D/accept/route.ts), [status handler](../src/app/api/leads/%5Bid%5D/status/route.ts) | Pitches are not public. Acceptance assigns a winner, sets `closed`, and can grant karma/notifications again on retry. Closing without hiring also sets `closed`. There is no actual completion rule. |
| [`/f/[username]`](../src/app/f/%5Busername%5D/page.tsx), [`PATCH /api/me`](../src/app/api/me/route.ts) | One profile and editor; Threads, Solved, and Active leads tabs; external portfolio link but no structured projects or reviews. Current GitHub URL verification is not account ownership or client verification. There is no payment/escrow integration. |
| [`listLeads`](../src/lib/queries.ts), [`LeadFeed`](../src/components/leads/LeadFeed.tsx), [`/saved`](../src/app/saved/page.tsx) | Lead ranks are calculated on a bounded candidate window, not the full matching set. Budgets/currency and `deadlineAt` exist, but budget units and lead skills do not. `/saved` and `saves` are thread-only. |

Baseline from the repository audit: plain `npm ci` failed; a legacy-peer install allowed typecheck and build but couldn't start Vitest without Vite. A disposable normal-install copy passed the 23 existing unit tests. Lint had 23 baseline errors. No database-backed flow, live identity provider, email, or storage was exercised. Treat the checks below as gates to run, not results already achieved.

## Decisions to approve before implementation

1. **One account, two independent intents.** Hiring and working aren't permission roles. Keep `users.id` and `/f/[username]`. “Open to hiring” is declared; “Currently hiring” is derived from a public lead accepting bids. A buyer need not fill in a portfolio or pick a custom handle.
2. **Draft first; verify before submission; review before first publication.** Draft locally in development. When real sign-in is introduced, save the final guest form as a short-lived `pending_verification` intake, not an unowned `leads` row. The link verifies the inbox and returns to a prefilled confirmation; **an authenticated POST**, not the link itself, submits it. At launch, queue all pilot leads, then always queue first-time or flagged leads. Only clean submissions from established buyers may later bypass the queue, with a switch to pause it. Email ownership is not a 99% spam guarantee.
3. **Keep three states separate.** Intake (`pending_verification`), publication (`pending_review`, `changes_requested`, `published`, `rejected`), and engagement (`open`, `awarded`, `completed`, unawarded `closed`, or post-award `cancelled`) answer different questions. Publication does not mean still accepting bids. Completion is the buyer's recorded outcome, not payment verification.
4. **Set guardrails explicitly.** Proposed starting contract floors, in whole units: USD 50 fixed / 20 hourly, EUR 50 / 20, GBP 40 / 16. These are policy values for review, not currency conversions. Apply them to new paid contracts only; don't retroactively reinterpret bounties, job compensation, or legacy budgets. Verify a specific deliverable and at least one valid skill. A plausible budget and a long description are not proof of legitimacy.
5. **Use literal trust labels.** `New Poster` identifies a first public listing. Later, `2 projects completed on Borynx` is evidence from completed awards. Do not ship a blanket `Verified Client` badge on the basis of email, a matching website domain, or a moderator-approved brief. Suppress unsupported escrow and verification copy.

**Order:** Phase 0 → 1 → 2 establishes the development workflow. Phase 3 is required before outside submissions, not before building the dev flow. Phases 4–6 extend the same workflow without new account types. Approve and test each separately; no public rollout is implied by a successful dev build.

**Shared contracts:** Use App Router handlers, Drizzle migrations, and existing `requireActor()`/role checks. Validate strictly at runtime: `400` malformed request/ID, `422` invalid fields, `401` no session, `403` denied action on a known public resource, `404` when existence is private, `409` stale/conflicting action, `429` with `Retry-After` on a limit. Preserve the `{ error, code }` envelope; field errors can add `fields`. Project or moderation drafts, verification state, and viewer-specific API results must not use shared caches.

**UI baseline:** Reuse [`src/app/globals.css`](../src/app/globals.css) and `PageFrame`/`PageHeader`. Use `.panel`, `.field`, `.btn.btn-primary`, `.btn.btn-ghost`, and labeled `.tag` variants; `ember` for primary/active, `gold` for pending, `success` for published/completed, `danger` for rejected/error, `ink-3` for hints. Use `.num` for rates/counts, visible focus, inline field errors, and accessible names for icon buttons. Don't introduce a separate client theme.

## Phase 0 — Repeatable local development

**Goal & scope.** Fix the lockfile/test baseline before changing marketplace behavior. Document the supported Node/npm version, fix `npm ci` without legacy flags, add `npm test` (`vitest run`), and keep baseline lint fixes separate from feature changes.

**Database & migrations.** No new product schema. Apply the full current journal (`0000`–`0004`) on disposable PostgreSQL and test an upgrade from a representative older app schema. Require a matching journal prefix; refuse untracked schema rather than marking a push as migrated. Gate `src/db/seed.ts` demo content to isolated dev/test. Use a buyer, two bidders, a site reviewer, and an unrelated user plus guest requests; don't rely on real personas or account IDs.

**API.** No new route. Keep dev `POST /api/auth/login` with `{ username }` for seeded identities and its existing `{ ok, user, … }` response inside demo mode only. Deny it outside that mode, and gate `x-bx-session`/bearer fallback on the server as well as the UI. Keep `/api/health` usable without adding public database diagnostics.

**UI.** Preserve `/login` and the persona picker in isolated dev; no new screens or tokens. Where demo mode is off, hide the picker and don't expose a working handle-only action.

**Security & validation.** Explicit dev/test opt-in, off by default outside the isolated environment. Protect the test DB from accidental real-environment selection. Reuse hashed sessions and `requireActor()`; no guest writes, real email, or new auth infrastructure here.

**Acceptance.** A clean checkout runs `npm ci`, `npm test`, typecheck, lint, and build. Fresh/upgrade migrations and seeded tests run against disposable PostgreSQL. Disabling demo mode stops the API and header path, not just the picker. No live credentials or data are required.

## Phase 1 — Draft, submit, and approve a lead in development

**Goal & scope.** A guest can draft; a demo buyer submits; an authorized moderator publishes it. All new submissions are pending in this phase. Implement the visibility gate before enabling the new write flow.

**Database & migrations.** Add `lead_publication_status` (`pending_review`, `changes_requested`, `published`, `rejected`) and `lead_budget_unit` (`fixed`, `hourly`). In `leads`, add `publicationStatus` defaulting to pending, nullable `publishedAt`, `reviewedAt`, `reviewedById`, `reviewNote`, `revision` starting at 1, and a nullable legacy-compatible `submissionKey` with unique `(authorId, submissionKey)` for non-null keys. Add nullable `budgetUnit` for legacy rows and bounded `skillTags` as a simple array; reuse `deadlineAt`. Keep `authorId` non-null and `isRemoved` independent. Backfill only known public legacy/demo records as published, not those merely `isVerified` or `closed`. Add `lead_review_decision` to the existing inbox type enum for author notices; update both bell/inbox mappings.

**API.** Share one runtime `LeadInput`: `{ title, description, category, kind, budgetMin, budgetMax, currency, budgetUnit, skillTags, deadlineAt?, location?, spaceSlug?, submissionKey }`. Title 10–180 chars; scope 60–20,000 trimmed chars and ask for a concrete deliverable. Category/kind/currency from configured choices, amounts bounded whole units with `min <= max` and the configured new-contract floor, 1–6 deduped canonical skill slugs, deadline a future ISO timestamp if present, submission key a UUID. Only offer public spaces as optional links for new leads.

| Route | Request → response |
|---|---|
| Existing `POST /api/leads` | `LeadInput` with a signed-in actor → `201 { id, href, publicationStatus: "pending_review" }`. A retry with the same author/key returns `200` with that record; it doesn't create another row. |
| Proposed `PATCH /api/leads/[id]` | Owner sends corrected lead fields and `revision` after `changes_requested` → `200 { id, revision, publicationStatus: "pending_review" }`. Revalidate, rescreen, and bump revision. Stale version or wrong state → `409`; no editing published scope in v1. |
| Proposed `PATCH /api/mod/leads/[id]` | `{ action: "publish" | "request_changes" | "reject", revision, reason? }` → `200 { id, publicationStatus }`. Reason required for changes/rejection. Record actor/time/reason, conditional on pending/current revision and not removed or withdrawn. |

**UI.** Change [`/l/new`](../src/app/l/new/page.tsx) and [`LeadComposer`](../src/components/leads/LeadComposer.tsx). Fix the existing invalid default category. Guest fills the `.field` form; **Continue to sign in** preserves the brief and key in the same browser; **Submit for review** creates the row after demo sign-in. Clear the draft on success, not failed submit. Use the existing private lead detail for status/reason. Add a Lead submissions section to `/mod/queue`: `tag-gold` pending, `tag-success` published, `tag-danger` rejected, `btn-primary` to approve, with textual labels and clear review actions. Keep the Reports section distinct.

**Security & validation.** Public reads require published, not removed, and compliance with space visibility. Apply this rule before ranking/counting and before returning a title, canonical slug, metadata, or redirect. Check board stats, API, search, `/f` activity, lead detail, votes, and bids; pending data is visible only to the author and authorized site reviewers. A site reviewer cannot approve their own lead; a space-only role isn't enough. Keep existing server rate limits and `screenContent`: block clear scams, hold allowed flags for review, and reuse reports for investigation. Fix report siblings to match type, ID, and pending status; report count alone doesn't remove a lead. No public badges, notifications, or share previews for a pending lead.

**Acceptance.** Guest drafting writes no DB row; guest POST fails; the draft survives the same-browser return; repeated clicks create one pending lead. An unrelated account and a guest see neither the row nor its title/counts via any public path. A reviewer can request changes and only publish the current revision. Dismissing a report never publishes a lead. An approved listing is visible, but new bids require published + open + not expired.

## Phase 2 — One award, then actual completion

**Goal & scope.** Keep pitches private and make bid/award/close actions reliable. Use one winner, not a new contract or payment subsystem.

**Database & migrations.** Add `awarded`, `completed`, and `cancelled` to `lead_status`; retain `closed` for unawarded closures and read older `in_review` rows. Add `awardedAt` and `completedAt` for new actions. Reuse `acceptedBidId` as canonical; synchronize `assignedUserId`/`leadBids.isAccepted` in the same transaction. Clean duplicate legacy bids before unique `(leadId, userId)` and at most one accepted bid per lead (partial unique index). Move a legacy `closed` lead to `awarded` only when the accepted bid belongs to it and agrees with the assignment; flag inconsistent rows and don't infer a completion date or reissue side effects. Commit enum changes before backfills use them; don't assume separate files commit separately in a single migration run. Add `lead_bid_accepted` to the inbox types, separate from `lead_bid`.

**API.**

| Existing route to change | Request → response |
|---|---|
| `POST /api/leads/[id]/bids` | `{ amount, message }` → `201 { id }`. Positive whole quote in the lead currency/unit; 20–4,000 char pitch; deny own-lead, duplicate, removed, pending, or expired submissions. Count successful pitches per bidder across leads; six per ten minutes, otherwise `429` with `Retry-After`. |
| `POST /api/leads/[id]/bids/[bidId]/accept` | No body → `200 { acceptedBidId, assignedUserId, status }`. Same award retry is a no-op; different second winner → `409`. Only the non-suspended poster can award; the bid must belong to the lead. The bid deadline stops new bids, not selection from valid existing bids. |
| `PATCH /api/leads/[id]/status` | `{ action: "close_without_hire" | "complete" | "cancel" }` → `200 { status, completedAt? }`. Validate current state and owner in the transaction; reject reopening, reassignment, and completion without an award. `{ action: "withdraw" }` retains the Phase 1 pre-publication author action. |

**UI.** Update [`LeadPosterControls`](../src/components/leads/LeadPosterControls.tsx), `BidForm`, lead detail and `LeadFeed` cards. Show the quote unit, distinct **Awarded**, **Completed**, **Closed without hire**, and **Cancelled** labels, and explicit owner actions instead of a free status dropdown. Use the existing inbox for new pitch/award notices and `tag-success` for completed, not for an unverified payment.

**Security & validation.** Use the same lead row lock for bid, award, and status changes; check eligibility inside the transaction. First award alone updates assignment, grants the existing karma, and writes one notice. Fetch all pitches only for the owner; a bidder can read only their own, and staff access must be narrowly authorized. Moderation removal hides the lead without overwriting project status. The normal owner routes do not allow staff to choose a winner on a client's behalf.

**Acceptance.** Run draft → approve → two pitches → award → complete with seeded accounts against PostgreSQL. Concurrent bids by the same user yield one row; concurrent awards to competing bidders yield one winner, one karma event, one notice; same-award retry changes nothing. Wrong-lead bids, non-owner actions, closed/cancelled completion, pending access, and public pitch disclosure fail. Legacy `closed` never becomes `completed` in migration.

## Phase 3 — Verified email intake (staging first)

**Goal & scope.** Add the real guest handoff after the dev loop works. Guest fills the brief and **Email + name**, company optional, at the end. Confirm email and submit without corporate onboarding. Test with staging accounts and inboxes before enabling outside use. Use one managed email provider flow; a managed identity service such as Supabase Auth is an option once the intended project is confirmed. Don't change the Drizzle app data layer.

**Database & migrations.** Add private `auth_identities` with unique `(provider, subject)`, app `userId` FK, private confirmed email and verification time. Never make legacy handles an identity key. Add nullable `users.companyName` for optional onboarding of a new buyer. Add private `lead_intakes`: random UUID, HMAC of normalized email, validated brief and submission key, name/company, `createdAt`, `expiresAt`, `consumedAt`, and nullable `leadId`. A live unconsumed row is `pending_verification`; consumption or expiration is independent of the lead's state. Unique intake retry key per email and bounded retention (propose 24 hours for unclaimed drafts; the auth link can expire sooner). Reuse shared platform/provider limits where available, otherwise use small atomic PostgreSQL rate-limit buckets with expiring keyed counters. No nullable author on `leads`, raw verification token table, or second account model.

**API.**

| Proposed route | Request → response |
|---|---|
| `POST /api/leads/intake` | `{ lead: LeadInput, email, displayName, companyName? }` → generic `202 { status: "check_email" }` after accepting the request. Validate email/size and name bounds (2–80 chars; company ≤100), re-use lead validation/screening, dedupe repeated intakes, then request the managed link. No public lead or Borynx session at this step. |
| `POST /api/auth/email` | `{ email }` → same generic `202 { status: "check_email" }` for regular sign-in. Limit actual sends, not just button presses. |
| Managed callback via `/api/auth/callback` | Provider-supported short-lived confirmation, exact redirect allowlist, server-side verified subject → create/reuse app user, issue first-party session, redirect to safe confirmation or login destination. Callback never publishes or consumes an intake. Existing profiles aren't overwritten by guest input. |
| `POST /api/leads/intake/confirm` | `{ intakeId }` plus a confirmed session matching the intended email and opaque intake context → `201 { id, href, publicationStatus }`; `200` on consumed retry by the same actor. Revalidate the brief and expiration, lock the intake, create one owned lead through the Phase 1 service, and record consumption atomically. Wrong account → `404`; expired own intake → `410`. Require confirmed sign-in on ordinary `POST /api/leads` too. |

**UI.** `/l/new` shows email/name/company after the same brief, then **Check your email** and an explicit **Submit for review** confirmation on return with the existing form prefilled. Reuse `.panel`, `.field`, `btn-primary`, `tag-gold` and accessible resend/error text. Generate a non-colliding handle in the background; no portfolio fields. Explain expiration and recovery; test the managed link's supported browser/device flow rather than assuming cross-device behavior.

**Security & validation.** Bind confirmation to the exact intake and the verified recipient; never consume every draft matching an email. No posting on a GET, link preview, or email scanner. Avoid account enumeration; don't log email/link proofs/briefs or put them in URLs. Use secure HttpOnly first-party cookies, exact same-origin return paths and CSRF/origin checks. Disable demo login/URL-only verification/header fallback outside demo and revoke sandbox sessions before external use. Keep private-space reads and direct database/API grants from bypassing app authorization. Initial tunables: two *new* guest intakes/hour per trusted ingress IP, a resend cooldown plus per-address cap, and account limits for signed-in writes. Adjust IP policy for shared networks. Add a challenge only if warranted by suspicious traffic. Moderate all pilot leads; only after review may clean, established posters bypass moderation, never when flagged.

**Acceptance.** Normal and returning sign-in, expired/replayed link, wrong account, repeated confirmed submission, rate limit, and mail failure all behave in staging. Clicking a link alone creates no public listing. No anonymous intake appears in any public surface, and a verified first or flagged submission stays pending. Demo credentials cannot post on staging. Public rollout, sender configuration, and real invites require separate approval.

## Phase 4 — Adaptive profiles and portfolio proof

**Goal & scope.** One account can display hiring signals, freelancer proof, or both. Do intent/settings first, then Projects as a separate small change. Encourage 3–6 curated projects, but allow one; six is a cap, not an onboarding requirement.

**Database & migrations.** Add `users.lookingToHire` and `availableForWork` (both false by default), nullable `companyUrl`, and nullable `hourlyRate`/`hourlyCurrency` as a pair (positive whole amount, supported currency). Reuse `companyName` from Phase 3. Add `portfolio_projects`: `id`, `userId` FK, `title`, `description`, optional `roleOutcome`, optional `liveUrl`/`repoUrl`, `techTags`, nullable `coverKey`/`coverAlt`, `position`, `isPublished` default false, nullable staff-controlled `hiddenAt`, timestamps. Index owner/order. Under the same owner lock, enforce six total projects and full-list reordering. No organization, skills taxonomy, metrics table, or separate role account.

**API.**

| Route | Request → response |
|---|---|
| Existing `PATCH /api/me` | Add partial `{ lookingToHire?, availableForWork?, companyName?, companyUrl?, hourlyRate?, hourlyCurrency? }` → existing `200 { ok, user }` with safe projection. Validate boolean types, rate/currency pair, company ≤100 chars, HTTPS company URL; explicit null clears optional fields. Never accept roles, badges, or hiring counts from the client. |
| Proposed `GET/POST /api/me/projects` | GET → `200 { items }` with user's drafts. POST `{ title, description, roleOutcome?, liveUrl?, repoUrl?, techTags }` → `201 { project }` in draft state. Title 3–120, description 20–2,000 chars, bounded role/outcome and 1–8 normalized tags, optional HTTPS URLs. |
| Proposed `PATCH/DELETE /api/me/projects/[id]`, `PUT /api/me/projects/order` | Owner edits fields/`isPublished` → `200 { project }`; delete → `204`; reorder `{ ids: [...] }` with exact distinct owned IDs → `200 { items }`. Concurrent cap violation → `409`. |
| Proposed `POST /api/me/projects/[id]/cover` and `GET /api/projects/[id]/cover` | Owner upload: multipart `{ file, altText }` → `200 { coverUrl, altText }`. One ≤3 MB PNG/JPEG/WebP; verify decoded content and re-encode without metadata. GET returns image bytes only for a public visible project or its authenticated owner preview; otherwise `404`. No raw public draft keys. |
| Proposed `PATCH /api/mod/projects/[id]` | Scoped staff `{ action: "hide" | "restore", reason }` → `200 { id, hidden }`. Record the decision; hiding removes the card and public cover. Owner publish/update cannot clear `hiddenAt`. |

**UI.** Extend `/settings`/`EditProfileModal` with independent labeled toggles and relevant optional fields. In `/f/[username]`, show freelancer rate/availability and Solved/Karma when relevant, or company, Leads, and hiring counts for a hiring view; if both, show both. **Currently hiring** derives from at least one public open unexpired lead; otherwise show **Open to hiring** only when declared. Show counts first. If displaying a rate, label it **Award rate** with its sample: count published visible leads with a canonical award divided by those plus explicitly closed-without-hire leads; leave undecided/open out, count completion separately, suppress percent until at least five decided leads. Use `?tab=projects`, existing tabs and `.panel` cards, tags, optional cover/alt, link buttons, and no mandatory public repo. Link Projects from bid review. `New Poster` is a neutral tag for the first public listing; the completed count is a separate claim.

**Security & validation.** Intent doesn't grant privileges or prevent either action. Query published projects only for visitors, including cover access. Strict HTTPS links with no server fetch of user-provided preview URLs. Use owner-scoped storage and a private preview; delete/replace old assets safely and limit upload size/dimensions. Ensure private auth fields, draft content, pending leads and pitches never leak via profile/hover payloads. Public counts use visibility rules. Give staff a scoped way to hide abusive published projects; no claim that a portfolio is vetted.

**Acceptance.** Test all four intent combinations, rate/company validation, company-only profile, both modes, and a user who still hires and bids under the same account. Counts do not include pending/removed leads and declared hiring does not fake an open lead. Owner can create, reorder, publish, unpublish and remove projects; seventh project is rejected even with concurrent requests. Another user cannot edit or load draft covers; Projects tab works on mobile and by deep link.

## Phase 5 — Lead filters and private saves

**Goal & scope.** Find and revisit relevant published leads. Ship budget/skill filters and flat bookmarks; saved searches, folders, digests, and indexing beyond actual query needs are not prerequisites.

**Database & migrations.** Reuse Phase 1 `budgetUnit`, currency, amount range and skill list. Add `lead_saves` with FKs to user and lead, composite `(userId, leadId)` primary key, `createdAt`, and user/saved-time index. Keep thread `saves` unchanged. Add feed indexes for the real published/status/sort query; use a skill GIN index if query plans justify it.

**API.**

| Route | Request → response |
|---|---|
| Existing `GET /api/leads` | Example: `?currency=USD&unit=fixed&min=50&max=500&skill=react&skill=nodejs&sort=new&cursor=…`. Amount filters require one currency and unit. Match inclusive range overlap and **any** selected skill. Validate enum/slugs, bounds, cursor and max page size. → `200 { items, nextCursor, … }`, with viewer-only `saved` where relevant. Filter and order the exact New results in SQL before cursor paging; tie-break on ID. Preserve existing Hot/Best as separately labeled unfiltered ranking if retained; don't serve a budget/skill filter from the newest-400 window. |
| Proposed `PUT/DELETE /api/leads/[id]/save` | No body, session is the owner → `200 { saved: true/false }`. PUT checks lead visibility; DELETE can remove one's save even if the corresponding lead is no longer visible. Idempotent, not a toggle. |
| Proposed `GET /api/me/saved-leads?cursor=…` | Signed-in viewer only → `200 { items, nextCursor }`; sort by saved time with stable lead ID tie-break. |

**UI.** Add URL-backed controls in `/l` and `LeadFeed`: `.field` budget inputs/unit, skill tags, clear filters, and a labeled Save button (`aria-pressed`) on cards/detail. Hydrate SSR and subsequent queries from the same normalized filters, reset cursor on changes, and batch saved state. Add Threads/Leads tabs to `/saved`. Closed/awarded/expired but still-public bookmarks display as unavailable; removed or newly private records aren't returned. Use the existing `.panel`, `.tag`, and `btn-ghost` controls. Don't sum unlike currencies or fixed/hourly amounts in board stats.

**Security & validation.** Apply publication and space visibility before filtering, paging and any public stats. Older unknown-unit records remain viewable without a rate filter, not silently reclassified. Bind saved operations to the session, use viewer-scoped cache keys/no shared personalized cache, and invalidate board/detail/saved views after mutation or account change.

**Acceptance.** Test inclusive range edges, bad ranges, mixed units/currencies, skill aliases/unknown tags, expired/pending leads, and results outside the prior 400-row window. A filter URL, initial render, and subsequent pages agree with no tie duplicates. Saves are private across accounts, retries don't toggle state, and thread saves still work.

## Phase 6 — Verified engagement reviews

**Goal & scope.** The client can leave one rating and testimonial for the actual winner after explicit completion. This verifies the Borynx engagement, not funds or legal identity.

**Database & migrations.** Add `lead_reviews`: `id`, unique `leadId` FK, `reviewerId`, `recipientId`, `rating` smallint with `CHECK (rating BETWEEN 1 AND 5)`, `testimonial`, visibility (`published`, `pending_review`, `hidden`), timestamps and moderator decision fields. Index recipient/visibility/time. Use a `lead_review` report target and update its routing explicitly (don't fall through to looking up a lead with the same numeric ID). Decide account deletion retention with the existing FK policy before exposing reviews.

**API.**

| Proposed route | Request → response |
|---|---|
| `POST /api/leads/[id]/review` | `{ rating: 1..5, testimonial }` → `201 { id, visibility }`; 20–2,000 trimmed chars, integer rating only, one review per lead (`409` duplicate). Transactionally derive author/recipient from the completed published lead and matching accepted bid, not request-supplied IDs. |
| `GET /api/users/[username]/reviews?cursor=…` | → `200 { items, count, averageRating, nextCursor }`, only visible testimonials, rating, date, and public reviewer handle/name. Don't return pitch, scope, budget, private lead URLs or email. Empty average is null. Server profile page may call the same query directly. |
| `POST /api/reports`, `PATCH /api/mod/lead-reviews/[id]` | Extend the existing report body with `targetType: "lead_review"`. Scoped staff action `{ action: "publish" | "hide" | "restore", reason }` → `200 { id, visibility }` with decision recorded. |

**UI.** Show **Leave a review** only to the eligible buyer on the completed lead; 1–5 labeled radio choices, textarea `.field`, `btn-primary`, and status if held. Add `/f/[username]?tab=reviews` using the existing accessible tabs, `.panel` review cards and `.num` aggregate. Display **From a completed Borynx lead**. Add a Report action and review entries to moderation. No complex edit/dispute conversation in the first version.

**Security & validation.** No self-review, staff-as-client shortcut, non-winning recipient, unawarded closure, cancellation, or synthetic migrated completion. Use an atomic unique insert, screen testimonial content, hold flagged reviews, and audit hides/restores. Both public lists and aggregates exclude held/hidden reviews and reviews on removed engagements; no payment inference or karma bonus for submitting a review.

**Acceptance.** Only the poster of an actual completed award can create one eligible review. Reject invalid stars, other actors, legacy `closed`, and cancelled cases. Two concurrent submissions produce one row. Removing or holding a review updates the profile average/count and direct API together. Check keyboard rating controls and narrow screens.

## Rollout boundaries and what not to build yet

- Keep schema changes additive and rebuild fixtures before changing endpoints/UI. Rehearse fresh and existing-schema DB upgrades; keep legacy ownership and visibility. If an external rollout needs rollback, pause new writes or sends while still enforcing secure sign-in and the publication gate; never roll back to working demo credentials or exposed pending rows.
- Only after Phase 3 is safe and someone can review leads should an invite-only pilot use real buyers. Approve manually and measure time to approval, relevant bids, and paid starts confirmed by both parties. When public access widens, keep first and flagged leads queued. A public lead, hire rate, and completed work count don't prove payment.
- Separate proposal backlog: generalized messaging, escrow/payments, organization accounts, saved searches/collections, weekly digest and instant discovery alerts, additional OAuth providers, and badges that require independent identity or earnings evidence. None is needed to validate the core flow.

**Decisions:** Phase 1 retains known-public legacy leads only and uses the proposed new-contract floors. Before Phase 3, confirm the identity provider, manual-first publication policy, and intake retention/security rules. Evaluate and approve each phase separately.
