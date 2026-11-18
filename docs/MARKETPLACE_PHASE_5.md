# Phase 5 — Lead discovery and private saves

## Try it locally

Use disposable loopback data. See the [local database runbook](./LOCAL_DATABASE.md) for the inherited demo sign-in regression and rollout boundary. This phase does not change auth, send email, or require a hosted database.

1. Open **Leads → New → Filter leads**. Pick a currency and budget unit before entering a minimum, maximum, or both. Add up to six skills and choose **Apply filters**. A public lead matches if its budget touches or overlaps the requested range and it has **any** selected skill. Use **Accepting pitches** to exclude expired, closed, awarded, and other non-accepting leads.
2. Copy or reload the filtered URL. **Load more leads** uses the same filters. **Clear filters** starts again with unfiltered New. **Hot** and **Best** are separate, unfiltered rankings of the 400 newest visible leads. They are not budget or skill search results.
3. Sign in and use **Save** on a public card or its detail page. Open **Saved leads**, or go to **Saved → Leads**. A still-public lead that stops accepting pitches stays bookmarked and is labeled **Unavailable**. A removed, unpublished, or newly space-restricted lead stops appearing; its bookmark does not grant access.
4. Press **Saved** again to remove your bookmark. **Saved → Threads** continues to work as before. Switch accounts to check that neither the saved list nor the pressed state carries over.

## API and storage

- `GET /api/leads?currency=USD&unit=fixed&min=50&max=500&skill=react&skill=node-js&sort=new` returns `{ items, nextCursor, mode, total }`. Whole budget amounts are optional and bounded to 0–10,000,000; any amount requires both an explicit currency (`USD`, `EUR`, `GBP`) and unit (`fixed` or `hourly`). There is no conversion. Existing unknown-unit rows remain visible when no unit or amount is requested. Repeated `skill` parameters are normalized to catalogue slugs and deduplicated (for example, `nodejs` and `Node.js` both become `node-js`). Filters combined with `sort=hot` or `sort=top` are rejected. Category, lead type, verified-only, and accepting-pitches filters are available in New.
- New filters public leads in SQL before paging, ordered by creation time and lead ID descending. The private library uses saved time and lead ID descending. Send `nextCursor` back unchanged for the same view/filter set. Page sizes default to 25 and are capped at 50. Hot/Best are approximate rankings and can change as votes change. Board-health counts describe the whole public board, not a sum of incompatible budgets.
- `PUT /api/leads/:id/save` and `DELETE /api/leads/:id/save` take no body. They require the current session and a same-origin request, returning `200 { saved: true }` or `200 { saved: false }`. Repeated PUTs preserve the original saved time. PUT uses the same public visibility rule for everyone, including authors and staff. DELETE removes only the caller’s bookmark, even when PUT would return `404`.
- `GET /api/me/saved-leads` returns `{ items, nextCursor }` for the signed-in account only. These APIs use `private, no-store`; a public feed has no save counts and does not include anyone’s saved state in guest responses. Lead and saved-list caches are scoped by viewer. Bookmark changes refresh the card, detail page, and library.
- `0011_lead_discovery_and_saves` adds `borynx_private.lead_saves`, with cascading user and lead references, a composite primary key, RLS with no browser access, and a saved-time index. Existing budgets, portfolios, and thread saves are preserved. Partial indexes support public New and accepting-pitch ordering. There are no saved searches, folders, digests, or new skill indexes in this phase.

## Verification

```sh
npm run test:db -- --lead-discovery-only
npm test -- src/lib/__tests__/lead-discovery.test.ts
npm run typecheck && npm run lint && npm run build
```

The disposable suite rehearses a fresh schema and the `0010` → `0011` upgrade, then checks cross-account reads and writes, legacy budgets, inclusive filters, alias handling, results past 400, same-timestamp paging, visibility changes, and existing thread bookmarks. See [Phase 6](./RECOMMENDATIONS_IMPLEMENTATION_PLAN.md#phase-6--verified-engagement-reviews) for the separate reviews follow-up.
