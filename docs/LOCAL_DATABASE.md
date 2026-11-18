# Phase 0: local database and demo sign-in

Phase 0 changes setup and safety, not marketplace publication, bidding, or awards. No product schema changed. The checks below use fictional rows in disposable PostgreSQL only.

## Quick setup

1. Use Node 22.12+ within the 22.x line and npm 10 (`.nvmrc`: 22.22.3; tested with npm 10.9.8).
2. Run `npm ci`. No legacy-peer flags or separate Vite install are needed.
3. Run `npm run dev:demo`. It creates a private temporary data directory, a loopback port, and a random database password. It does not use your shell's `DATABASE_URL`. Start as a non-root user. Data is removed on normal shutdown.
4. Visit `/login`. The buyer, two bidders, reviewer, and observer are fictional seeded identities; buyer/bidder/observer all have the ordinary member role. The reviewer has a site moderator role. Tests use the returned IDs rather than assuming numeric IDs. Use a signed-out request for the guest case.

For your own dedicated local DB, copy `.env.example` to `.env.local`, set `DATABASE_URL`, and opt in with `BORYNX_DEMO_MODE=1` before `npm run dev`. Only loopback PostgreSQL URIs for `borynx_demo` or `borynx_demo_<suffix>` without URL parameters are accepted in demo mode. Use synthetic data only; don't reuse a port forwarded to a shared database. Restart the app after changing database settings or the demo flag.

### Sign-in boundary

- Demo fixtures, handle-only sign-in, and the iframe header fallback require the same server-side opt-in. Only the five reserved fictional handles can obtain demo sessions. No arbitrary account creation is offered.
- With the flag off, or under `next start` (production), new demo sign-in returns `404`. Existing demo cookies, `x-bx-session`, and bearer tokens do not authenticate. The app won't ship the persona picker or the fetch shim. No automatic purge of existing rows or sessions is performed. Real sign-in is a later phase; do not restore legacy session acceptance when adding it.
- The badge catalogue is application data and still loads in non-demo mode. No demo users, posts, or leads are inserted then. `/api/health` returns `{ "ok": true }` or a `503` with `{ "ok": false }`; it does not publish database diagnostics. Detailed `/status` information is for the isolated demo only.

## Migration ledger

Use a dedicated database and back up existing data before you apply any migration. On startup the app locks and verifies `drizzle.__drizzle_migrations`, then applies only pending files from the checked-in journal. The ledger must be the exact prefix of known timestamps and hashes. The manual `npm run db:migrate` command uses the same check and requires an explicit `DATABASE_URL` (environment, `.env.local`, or `.env`). It applies schema only, not demo seeding.

A fresh database can have an empty ledger. A database with untracked tables/enums in `public`, an unknown hash, or a newer/partial ledger is deliberately not auto-adopted. Do not run `drizzle-kit push`, edit historical SQL, or insert ledger rows to silence the check. Recreate throwaway databases. For a database that must be kept, first take a backup and compare its actual schema and recorded ledger to the checked-out migration history on a copy. Production reconciliation is a separate operation, not part of this setup.

## Verification

| Command | Coverage |
|---|---|
| `npm ci` | Immutable dependency install from the lockfile. |
| `npm test` | Unit suite, including demo-mode and database-URL policy. |
| `npm run typecheck`, `npm run lint`, `npm run build` | TypeScript, lint, and production compile. The pre-existing lint fixes are isolated in their own commit. |
| `npm run test:db` | Creates its own fresh databases. Boots all five migrations, upgrades from `0002` with a legacy lead, bid and thread, verifies concurrent and repeat runs do not double-apply, and refuses untracked or mismatched ledgers. Boots demo and non-demo apps, checks minimal readiness responses, tests demo transports and guest write denial, and runs the post edit/delete integration tests. |

`test:db` does not take a database URL or reuse an app server. Stop any existing Next.js dev process in this checkout first. The standard unit suite intentionally skips the three post-author HTTP cases; the database runner executes them against the fresh app. No Supabase project or staging credentials are needed.
