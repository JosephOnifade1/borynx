# Private kickoff while a pitch is winning

Selecting a pitch changes the public lead to **Awarded**. **Winning pitch** identifies the buyer’s selection; it does not mean work started, payment was received, or the work is complete. Kickoff adds a private handoff without changing the public status or the steps required for completion.

## Walkthrough

Use separate test accounts and browser profiles on a disposable database. The local HTTP suite below explicitly inserts fictional accounts; it does not depend on automatic demo seeding.

1. The buyer awards a public lead. The winning pitch links to **Send kickoff details**. The winner’s award notification opens `#kickoff`, where they see **You won — waiting for kickoff details**. Pitches remain closed.
2. The buyer submits a short kickoff note, a proposed calendar date, and one contact method. Only what the buyer types is shared; the form does not look up or prefill a sign-in email. Don’t include access codes, passwords, or payment details. The buyer can send once, with no edit or resend in this version.
3. The winner’s new in-app notice links back to the private details. **Acknowledge details** confirms receipt only. The buyer gets a receipt notification. Both participants see the acknowledged state; the lead is still **Awarded**.
4. The buyer can mark complete or cancel at any time, even without a kickoff. Completion, cancellation, and report-approved lead removal remove the stored handoff and its kickoff notices from the app. Ordinary award notices are separate. Cancellation preserves the award record and does not reopen pitches; the [review flow](./MARKETPLACE_PHASE_6.md) still requires explicit completion.

## Access and storage

- The canonical detail page renders the handoff dynamically for the signed-in, non-suspended buyer or confirmed winner. Guests, other bidders, and staff who are not a participant do not receive the form, note, date, or contact. There is no kickoff read API, public feed entry, chat, email send, or payment integration. Notification bodies use the public lead title, not kickoff content.
- `POST /api/leads/:id/kickoff` → `201 { state: "sent" }`. Bounded JSON accepts only `note` (10–1,000 trimmed Unicode characters), `startDate` (a valid `YYYY-MM-DD`), and `contact` (3–200 characters on one line). `PATCH` with `{ action: "acknowledge" }` → `200 { state: "acknowledged" }`. Only the winner can acknowledge, and retries do not create another notice. Both writes require exact origin and an eligible actor.
- [`0013_private_award_kickoff`](../drizzle/0013_private_award_kickoff.sql) creates `borynx_private.lead_kickoffs` with RLS and no browser-role grants. Lead, selected bid, buyer and winner must still match. There is no historical backfill. A valid award from before the migration can start a kickoff; unresolved legacy awards cannot. An out-of-band award change does not transfer existing contact information to a different bid or recipient.
- Sends and acknowledgments lock the lead before the bid and write the notice in the same transaction. Ending or removing the lead takes the same lead lock. Foreign keys cascade hard deletes of the lead, selected bid, or either participant to the private row. The inbox suppresses stale kickoff notices that lack a matching active handoff. App removal cannot recall contact details the winner has already copied.

## Rehearse locally

```bash
npm ci
npx vitest run src/lib/__tests__/lead-kickoff-input.test.ts
npm run test:db -- --kickoff-only
```

The database runner checks fresh and `0012` → `0013` migration paths, grants with permissive defaults, participant-only HTML, notification payloads and links, concurrent writes, and outcome/removal cleanup. Stop any existing Next development server in this checkout before running it. This feature has not been applied to a hosted database. Follow the [local database runbook](./LOCAL_DATABASE.md) and resolve the existing demo/startup regression before external rollout.
