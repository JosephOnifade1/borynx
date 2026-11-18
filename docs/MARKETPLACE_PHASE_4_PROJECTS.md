# Phase 4 — Portfolio projects

Profiles can share up to six work samples alongside their existing community, hiring, and availability signals. A project is a self-published work sample, not verified engagement or payment evidence.

## Try it locally

> Use fictional data in a dedicated loopback database only. This branch inherits the demo sign-in isolation regression on `main` (`65fc188`). Do not expose a dev server through a proxy or advance a hosted rollout until that regression is fixed.

1. Sign in to a local test account. Open **Settings → Manage projects → New project**, enter a title, description, and 1–8 technology tags, and **Save draft**. An optional role/outcome and HTTPS links give readers context; a public repo is not required.
2. Edit the draft to upload or replace an optional cover. Choose one still PNG, JPEG, or WebP (up to 3 MiB, 4096 × 4096 and 12 megapixels). Add a short description for informative images; empty alt text is for decoration. Covers save separately from project details.
3. Use **Up / Down** to order projects and **Publish** when ready. Open **View public projects** or `/f/<handle>?tab=projects` as a signed-out visitor. You should see only published, visible projects, in order. Lead posters can open that same public tab from private pitch review.
4. **Unpublish** to return a project and cover to private draft, or **Delete** to remove them. Site moderators can hide another user's published project from their public Projects tab. Restore it in **Moderation queue → Hidden portfolio projects**; restoring removes the staff hold, not the owner's draft setting.

## Data and API boundaries

- Migration `0010_portfolio_projects` creates private-schema project, cover, and decision tables. It preserves all profile settings and creates no sample projects. Each project owns at most one cover row; PostgreSQL stores sanitized WebP bytes under the project foreign key instead of a public bucket or object key. Replacement is atomic and project deletion cascades to the cover. No Supabase Storage setup is required.
- `GET /api/me/projects` and `POST /api/me/projects` require an authenticated account. Create always starts as draft. Fields: title 3–120 characters, description 20–2,000, optional role/outcome ≤500, optional credential-free HTTPS live/repo URLs, and 1–8 normalized tags. Links are never fetched by the server.
- `PATCH /api/me/projects/:id` partially updates fields and publication intent; optional text or links can be cleared with `null`. `DELETE` returns `204`. `PUT /api/me/projects/order` accepts the exact current set of owned IDs, once each. An owner-row lock serializes writes; six unique positions also enforce the cap in PostgreSQL. The seventh project or a stale order returns `409`. Writes require a matching `Origin`; suspended accounts cannot write.
- Upload via `POST /api/me/projects/:id/cover` (`multipart/form-data`, one `file`, optional `altText`); `DELETE` on that route clears the cover. Uploads are bounded even without `Content-Length`, decoded and resized to fit within 1600 × 1600, then re-encoded without file metadata. `GET /api/projects/:id/cover` checks visibility on every request and sends `private, no-store`. Only the owner can retrieve unpublished/hidden covers, including through an authenticated preview; everyone else gets `404`. There are no public cache entries or draft asset keys.
- Site moderators may `PATCH /api/mod/projects/:id` with `{ action: "hide" | "restore", reason }` for another account's project. Hiding an ordinary draft is not allowed. The decision and visibility change commit together; owners cannot clear the hold. The staff queue shows identifiers for restoration, not hidden titles, text, or covers. The audit record survives project removal.

## Verification

```sh
npm run test:db -- --projects-only # fresh and 0009 → 0010 migrations; HTTP on disposable data
npx vitest run src/lib/__tests__/portfolio-input.test.ts src/lib/__tests__/portfolio-covers.test.ts
npm run typecheck && npm run lint && npm run build
```

The project suite covers draft and cover access across guest, member, owner, and site staff; concurrent creates and full-list ordering; media limits and metadata removal; publication, deletion and moderation; and the Projects link in private pitch review. See the [local database runbook](./LOCAL_DATABASE.md) for the baseline demo regression and safety caveat.
