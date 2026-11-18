# Local database and demo sign-in

Phase 0 established the setup and safety checks; this runbook covers the current journal through Phase 3. The checks below use fictional rows in disposable PostgreSQL only.

## Quick setup

1. Use Node 22.12+ within the 22.x line and npm 10 (`.nvmrc`: 22.22.3; tested with npm 10.9.8).
2. Run `npm ci`. No legacy-peer flags or separate Vite install are needed.
3. Run `npm run dev:demo`. It creates a private temporary data directory, a loopback port, and a random database password. It does not use your shell's `DATABASE_URL`. Start as a non-root user. Data is removed on normal shutdown.
4. Visit `/login`. The buyer, two bidders, reviewer, and observer are fictional seeded identities; buyer/bidder/observer all have the ordinary member role. The reviewer has a site moderator role. Tests use the returned IDs rather than assuming numeric IDs. Use a signed-out request for the guest case.

### Sign in to restored local demo accounts

1. Use a dedicated local PostgreSQL database named `borynx_demo` or `borynx_demo_<suffix>` with fake data only. Take a backup first: the app checks and can advance an existing migration ledger on startup. Use a local restore for rehearsals, never a port forwarded to a shared database.
2. Copy `.env.example` to `.env.local`. Set `DATABASE_URL` to the loopback PostgreSQL URL for that database, without query options, and set `BORYNX_DEMO_MODE=1` and `BORYNX_DEMO_EXISTING_ACCOUNTS=1`.
3. Run `npm run dev -- --hostname 127.0.0.1` and open `http://127.0.0.1:3000/login`. Pick an existing account or type its exact handle (with or without the `f/` prefix). Sign-in reuses the account ID and role, rather than creating a new user. An active suspension blocks sign-in; an expired one does not. Keep this server on loopback; don't tunnel or proxy it. Restart after changing the database or either flag.

### Sign-in boundary

- Demo fixtures and handle-only sign-in require an explicit development/test opt-in and a dedicated local database. `npm run dev:demo` ignores the existing-accounts setting and exposes only the five fictional persona sign-ins on disposable PostgreSQL. The extra existing-accounts mode is for direct loopback requests only. The picker, new sessions, and cookie/header/bearer validation enforce the same rule. Neither mode can create accounts through `/login`.
- With the flag off, or under `next start` (production), new demo sign-in returns `404`. Existing demo cookies, `x-bx-session`, and bearer tokens do not authenticate. The app won't display the persona picker or install the fetch shim. No automatic purge of existing rows or sessions is performed. Verified email sign-in is independently gated; see the [Phase 3 staging runbook](./MARKETPLACE_PHASE_3.md). It never accepts legacy credentials.
- The badge catalogue is application data and still loads in non-demo mode. No demo users, posts, or leads are inserted then. `/api/health` returns `{ "ok": true }` or a `503` with `{ "ok": false }`; it does not publish database diagnostics. Detailed `/status` information is for the isolated demo only.

## Migration ledger

Use a dedicated database and back up existing data before you apply any migration. On startup the app locks and verifies `drizzle.__drizzle_migrations`, then applies only pending files from the checked-in journal. The ledger must be the exact prefix of known timestamps and hashes. The manual `npm run db:migrate` command uses the same check and requires an explicit `DATABASE_URL` (environment, `.env.local`, or `.env`). It applies schema only, not demo seeding.

Each migration file and its ledger row commit in the same transaction while the advisory lock stays held across the run. A failed file rolls back completely; earlier files remain committed as a verified prefix. In Phase 2, `0006` adds enum values that `0007` can use only after `0006` commits. Use the app migrator or `npm run db:migrate`; do not batch these files with `drizzle-kit migrate`. Use a direct connection (not a transaction-pooled endpoint) for migration rehearsal.

A fresh database can have an empty ledger. A database with untracked tables/enums in `public`, an unknown hash, or a newer/partial ledger is deliberately not auto-adopted. Do not run `drizzle-kit push`, edit historical SQL, or insert ledger rows to silence the check. Recreate throwaway databases. For a database that must be kept, first take a backup and compare its actual schema and recorded ledger to the checked-out migration history on a copy. Production reconciliation is a separate operation, not part of this setup.

## Verification

| Command | Coverage |
|---|---|
| `npm ci` | Immutable dependency install from the lockfile. |
| `npm test` | Unit suite, including demo-mode and database-URL policy. |
| `npm run typecheck`, `npm run lint`, `npm run build` | TypeScript, lint, and production compile. The pre-existing lint fixes are isolated in their own commit. |
| `npx drizzle-kit check` | Checks migration snapshots and journal consistency without applying SQL. |
| `npm run test:db` | Applies the journal to a fresh database and upgrades from `0002`, `0004`, `0005`, and `0007`. Verifies legacy award reconciliation, uniqueness, safe resume after a failed file, concurrent and repeat migration runs, and refusal of untracked or mismatched ledgers. Checks existing local account sign-in and restrictions as well as the five-persona and disabled modes; runs the thread-author, lead-publication, and lead-engagement HTTP suites, plus a staged email rehearsal with a local HTTPS provider double. |

`test:db` requires `openssl` for the throwaway TLS fixture and does not take a database URL or reuse an app server. Stop any existing Next.js dev process in this checkout first. The standard unit suite intentionally skips the HTTP integration cases; the database runner executes them against the fresh app. No Supabase project or staging credentials are needed.
