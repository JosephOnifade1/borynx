# Phase 2: private pitches, one award, and completion

This workflow is for development with fictional accounts. It does not process payment, hold escrow, verify a client, or open the marketplace to outside submissions.

## Try it on disposable PostgreSQL

Run `npm ci` and `npm run dev:demo`. Use separate browser profiles or Playwright contexts, not just tabs sharing the same session cookie. Anyone with demo access can choose the fictional reviewer. To try the same workflow with your existing local test accounts instead, follow the [local sign-in setup](./LOCAL_DATABASE.md#sign-in-to-restored-local-demo-accounts).

1. At `/l/new`, draft a fictional brief as a guest. Select a currency, fixed or hourly budget, and at least one skill. Continue to sign in as **Demo Buyer** and submit the restored draft for review.
2. As **Demo Reviewer**, open `/mod/queue`, find the brief under **Lead submissions**, and publish it. Copy the public listing URL.
3. As **Demo Bidder A** and **Demo Bidder B**, open that URL and send different pitches. The quote is a whole amount in the listing's currency and unit. Each bidder sees only their own pitch; a signed-out visitor, **Demo Observer**, and the reviewer see neither. The public board shows status and total bid count, not individual quotes or pitches.
4. As **Demo Buyer**, open the same listing. Under **Pitches received**, choose **Award lead** for one bidder and confirm. The selected pitch receives a winner label and that bidder receives an award notice in the bell and `/notifications`. The lead now says **Awarded** and cannot accept new pitches or another winner.
5. While the pitch is winning, the buyer can [send private kickoff details](./MARKETPLACE_KICKOFF.md) and the winner can acknowledge them. Neither action is required to record an outcome.
6. Use **Mark complete** and confirm. The board and detail page now say **Completed**. This means the buyer recorded the work as complete, not that Borynx verified payment. On a separate brief, try **Close without hire** before selecting a pitch, or **Cancel engagement** after an award. Both are terminal; cancellation preserves the original award.

## Write and visibility rules

- `POST /api/leads/:id/bids` accepts a positive whole-number quote and a trimmed pitch of 20–4,000 characters. A bidder can submit once per lead and up to six successful pitches per ten minutes across leads (`429` with `Retry-After` if limited). Owners cannot bid on their own leads. The deadline prevents new pitches, not awards from existing pitches.
- Only the non-suspended owner can select a winner. Repeating the same successful award returns the current status without another write or notification. New awards and completions do not grant karma; previous award karma remains in the ledger. Competing awards conflict. New awards and outcomes serialize on the lead row along with bidding and moderation removal.
- `PATCH /api/leads/:id/status` takes an `action`: `close_without_hire`, `complete`, `cancel`, or `withdraw` for the Phase 1 pre-publication author action. There is no reopening or reassignment. Report approval hides the listing independently of its outcome.
- There is no staff override for hiring or general staff access to pitches. Pitch access in the app is limited to the buyer and the bidder who submitted each pitch, on a visible public listing. Older listings with no recorded budget unit are shown as such.

## Legacy data and migration safety

[`0006`](../drizzle/0006_lead_engagement.sql) adds engagement statuses, timestamps and the distinct award notification type. [`0007`](../drizzle/0007_reconcile_legacy_bids.sql) promotes a legacy `closed` listing to `awarded` only when its canonical bid belongs to the lead, matches the assigned user and isn't the owner's own bid. Where the pointer and assignment agree, the acceptance marker is synchronized. Other inconsistent records retain their pointers, are marked `award_needs_review`, and cannot receive pitches or change outcome through the app. There is no automatic repair. Historical records do not receive inferred dates, completions, karma, or notices. Existing currency, prices and budget units are left intact.

Dedupe keeps the canonical bid when present, otherwise the earliest pitch per bidder/lead. Discarded duplicates and cleared legacy acceptance markers are preserved in `lead_bid_archive`, which has row-level security enabled, no policies granting ordinary roles access, and no app reader. Bid counts are reconciled before applying the uniqueness indexes.

Use `npm run test:db` to rehearse fresh installs and older-ledger upgrades, and to check race conditions, privacy, outcome transitions, rate limits and report removal. Follow the [local runbook](./LOCAL_DATABASE.md): use the app migrator or `npm run db:migrate`, **not** a batched `drizzle-kit migrate`. Before any future rollout, back up the database, rehearse on an isolated restore and stop older app instances before applying the new journal. Older code can overwrite awards or expose pitches to moderators. No live migration or external rollout is part of Phase 2.
