# Phase 1: draft, submit, and review a lead

This is a development workflow, not a live signup or publishing rollout. Run `npm ci` and `npm run dev:demo`; the demo command ignores existing database credentials and uses disposable PostgreSQL. Use fictional briefs only. Anyone with access to the demo can choose the reviewer persona.

1. As a signed-out guest, open `/l/new` and fill in a brief, budget and at least one skill. **Continue to sign in** keeps the draft in the same browser tab; no lead is written yet. Choose **Demo Buyer**, return to the form, then **Submit for review**. The brief is private and listed under **Your submissions** on `/l/new`.
2. In a separate browser session, choose **Demo Reviewer** and open `/mod/queue`. **Lead submissions** is separate from **Reports**. Choose **Review brief**, then publish, request changes, or reject. Changes and rejection require a note to the buyer. A site reviewer cannot review their own lead; a space moderator cannot publish it.
3. If changes are requested, return to the buyer session, open the private brief, and **Resubmit for review**. Reviewers must open the new revision before deciding. The author can withdraw a brief that is pending or awaiting corrections. Dismissing a report never publishes the brief.
4. Once published, confirm the lead appears on `/l`, the author's active leads and search. Try bidding as either **Demo Bidder**. Pitches require a public, open listing with a deadline that hasn't passed. Continue with the [Phase 2 award and completion walkthrough](./MARKETPLACE_PHASE_2.md).

## Confirmed policy

Minimums apply only to new paid **contracts**, not bounties, jobs, or historical amounts:

| Currency | Fixed | Hourly |
|---|---:|---:|
| USD | 50 | 20 |
| EUR | 50 | 20 |
| GBP | 40 | 16 |

Drafts remain on the device until the signed-in submit. A retry with the same author and draft key returns the same row. A pending lead has no public canonical redirect, title in metadata, board counts, profile entry, sharing controls, or new bid/vote actions. Decision notices are private to the buyer. Report removal is independent of publication and affects only pending reports for the same target type and ID.

## Database and rollout

`0005_lead_publication` adds publication/review fields, nullable budget units, skill tags, and the private review notification type. It marks only existing, non-removed leads with no space or a public space as published. It does not delete any rows, reinterpret a legacy budget unit, assign a reviewer retrospectively, or change old bids, awards, or engagement status. Restricted/private and removed leads are not made public. Previously seeded demo users are not cleaned up by this migration.

`npm run test:db` rehearses fresh and upgrade installs, checks the backfill, and exercises the workflow with fictional accounts. **Do not point the app or migration CLI at the live database just to try Phase 1.** A Git pull alone is harmless, but app startup against a database with a matching ledger applies pending migrations automatically. Use a disposable database or a separate restored database first. Before any eventual rollout, replace all old app instances with the publication-aware code before enabling new submissions; older instances do not enforce the new privacy rules. Real account verification and external intake are later phases.
