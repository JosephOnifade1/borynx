# Phase 6 — Verified engagement reviews

**Development only.** A testimonial verifies that the buyer marked a Borynx award complete. It does not verify payment, the work itself, or anyone’s legal identity. Submitting one does not grant karma or a badge.

## Walkthrough

1. On a public lead, use the buyer account to award a pitch and explicitly mark the engagement complete. The buyer now sees **Leave a review**. An open, unawarded, cancelled, or unresolved legacy engagement is not eligible. The winner, other bidders, and staff who are not the buyer cannot submit.
2. Choose 1–5 stars and write 20–2,000 characters of plain text. The rating and testimonial are intended for public display, so leave out private pitch, payment and contact details. A lead accepts one submission, with no edit or dispute flow.
3. Visit the winner’s **Reviews** tab (`/f/<handle>?tab=reviews`). Each published review is labeled **From a completed Borynx lead**. Only publicly eligible reviews appear or count toward the score. The count and average cover all eligible reviews, not just the current page.
4. A blocked testimonial is rejected. A flagged one is held and the buyer sees that it is awaiting moderation. Held and hidden text isn’t in the profile response, even for the recipient or staff.
5. In the **site-wide** moderation queue (`/mod/queue`), staff can publish held reviews or restore hidden ones if the engagement is still publicly eligible. Staff can hide published reviews from the profile, or hide held reviews from the queue. Each decision needs a reason. Staff cannot act on reviews they wrote or received.
6. **Report** on a card files a site-wide review report. Approving it hides the review, not the lead, its winner, or a comment with the same ID. Dismissing it leaves visibility unchanged. Space queues never show review reports. A direct moderation decision closes the automated screening report, if still open, without resolving unrelated user reports.

## API and storage

- `POST /api/leads/<id>/review` accepts `{ rating, testimonial }` and returns `201 { id, visibility }`. The transaction locks the lead and checks its completed status, completion timestamp and matching accepted pitch before deriving both accounts. No submitted identity or publication state is accepted. A duplicate returns `409`; a nonpublic lead returns the same `404` as a missing one.
- `GET /api/users/<handle>/reviews?cursor=…` returns `{ items, count, averageRating, nextCursor }`. `averageRating` is `null` if there are no eligible reviews. Each item carries only the review ID, rating, plain text, timestamp and reviewer’s public handle/name. The newest-first cursor preserves PostgreSQL timestamp precision and uses the review ID to break ties. The profile uses the same query and visibility rules.
- `POST /api/reports` accepts `targetType: "lead_review"` for publicly visible reviews. `PATCH /api/mod/lead-reviews/<id>` accepts `{ action: "publish" | "hide" | "restore", reason }` and returns `{ id, visibility }`. `publish` is for held reviews, `hide` is for published or held reviews, and `restore` explicitly publishes a hidden review. Hiding does not require a still-public lead. Review mutations are same-origin; review responses are not stored in a shared cache.
- `0012_verified_engagement_reviews` adds `borynx_private.lead_reviews` and `borynx_private.lead_review_decisions`. They use RLS with no browser policies, with grants revoked from `PUBLIC`, `anon` and `authenticated`. The migration does not invent reviews or completion records. The latest reason and reviewer of a moderation decision are internal; the decision table keeps the complete history of visibility changes while the review exists.
- **Deletion:** hard-deleting the lead or either participant erases the review and its decision notes. Like existing moderation references, deletion of a moderator nulls the moderator reference but keeps the decision. Soft-removal, loss of public visibility or broken award evidence makes a review ineligible for public display without erasing its private record. Existing polymorphic reports retain ordinary routing metadata and user-supplied report context if their target is deleted; automated reports do not snapshot testimonial text. Staff may resolve an orphan report without acting on another target.

## Local verification

```bash
npm test -- src/lib/__tests__/lead-review-input.test.ts
npm run test:db -- --lead-reviews-only
```

The disposable suite rehearses a fresh schema and the `0011` → `0012` upgrade, including browser-role grants, deletion behavior, and existing leads, bids, saves and reports. HTTP tests cover role and state gates, concurrent submissions, publication and report decisions, removed leads, alias navigation, and cursor ties. For a browser smoke test, use a disposable loopback app at 320px and 390px: Tab into the star group, select with arrow keys, submit using the keyboard, and verify the profile total and moderation actions. Follow the [local database runbook](./LOCAL_DATABASE.md) for the existing demo isolation warning. Don’t expose a demo or run this migration against a hosted database as part of these checks.
