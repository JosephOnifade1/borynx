# Local database and demo sign-in

Phase 0 established the setup and safety checks; this runbook covers the journal through private award kickoff (`0013`). The checks below use fictional rows in disposable PostgreSQL only.

> **Known baseline regression:** `65fc188` on `main` loosened demo host/database boundaries and broke the seeded-persona and opt-out checks. The intended boundaries below are not reliable on that baseline. Use only disposable loopback data, do not expose demo servers through a proxy, and fix demo isolation before a hosted rollout. Targeted suites such as `--lead-reviews-only` and `--kickoff-only` isolate their own loopback app and database.

## Quick setup

1. Use Node 22.12+ within the 22.x line and npm 10 (`.nvmrc`: 22.22.3; tested with npm 10.9.8).
2. Run `npm ci`. No legacy-peer flags or separate Vite install are needed.
3. Run `npm run dev:demo`. It creates a private temporary data directory, a loopback port, and a random database password. It does not use your shell's `DATABASE_URL`. Start as a non-root user. Data is removed on normal shutdown.
4. Visit `/login`. The buyer, two bidders, reviewer, and observer are fictional seeded identities; buyer/bidder/observer all have the ordinary member role. The reviewer has a site moderator role. Tests use the returned IDs rather than assuming numeric IDs. Use a signed-out request for the guest case.

### Sign in to restored local demo accounts

1. Use your existing dedicated PostgreSQL test database; no special database name is required. Take a backup first: the app checks and can advance the migration ledger on startup. Use a local restore for rehearsals, never a port forwarded to a shared database.
2. Keep `DATABASE_URL` in your environment or `.env.local` pointing directly at the loopback database, without query options. If unset, `npm run dev` uses the local `app_db` connection from `.env.example`. Neither demo flag is required. Remove `BORYNX_DEMO_MODE=0` if it was copied from the old example; keep it only to intentionally disable demo sign-in.
3. Run `npm run dev` and open `http://127.0.0.1:3000/login`. Pick an existing account or type its handle (with or without the `f/` prefix). Sign-in reuses the account ID and role. An active suspension blocks sign-in; an expired one does not. Restart after changing the database or opt-out setting.

### Sign-in boundary

- `npm run dev` binds to loopback for existing accounts and rejects a public hostname. Don't tunnel or proxy this server. The picker, new sessions, and cookie/header/bearer validation all require compatible local requests. Use `npm run dev:demo` for a disposable preview: it ignores the configured database and exposes only the five fictional persona sign-ins. Neither mode creates accounts through `/login`.
- With `BORYNX_DEMO_MODE=0` under `npm run dev`, or under `next start` (production), demo sign-in returns `404`. Existing demo cookies, `x-bx-session`, and bearer tokens do not authenticate. No existing rows or sessions are purged. Verified email sign-in is off in local development and separately gated for approved staging; see the [Phase 3 staging runbook](./MARKETPLACE_PHASE_3.md).
- The badge catalogue is application data and still loads with demo sign-in off. Normal `npm run dev` does not seed demo users, posts, or leads into your configured database; use `npm run dev:demo` for fixtures. `/api/health` returns `{ "ok": true }` or a `503` with `{ "ok": false }`; it does not publish database diagnostics. Detailed `/status` information is for demo mode only.

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
| `npm run test:db -- --local-demo-only` | Boots plain `npm run dev` against a temporary database with a pre-existing test account. Checks the picker, original ID and role, cookie and sign-out, and that no fixture users are added. |
| `npm run test:db -- --profiles-only` | Upgrades a disposable `0008` database and exercises adaptive profiles over HTTP, including intake-name privacy and public lead counts. |
| `npm run test:db -- --projects-only` | Verifies a fresh schema and the `0009` → `0010` upgrade, private storage, and portfolio boundaries over HTTP. |
| `npm run test:db -- --lead-discovery-only` | Verifies fresh and `0010` → `0011` migrations, exact budget and skill paging, and private bookmarks on disposable data. |
| `npm run test:db -- --lead-reviews-only` | Rehearses fresh and `0011` → `0012` migrations, then checks completed-award reviews, public totals, and moderation over HTTP. |
| `npm run test:db -- --kickoff-only` | Rehearses fresh and `0012` → `0013` migrations and tests private handoff, grants, concurrency, and cleanup over HTTP. |
| `npm run test:db` | Runs the local dev regression, five-persona and opt-out checks, and journal upgrades from `0002`, `0004`, `0005`, `0007`, `0008`, `0009`, `0010`, `0011`, and `0012`. Verifies legacy award reconciliation, safe resume, and ledger validation. Also runs the thread-author, lead-publication, lead-engagement, adaptive-profile, portfolio, lead-discovery, engagement-review, and private kickoff HTTP suites plus email staging with a local HTTPS provider double. The baseline demo regression currently prevents a full pass. |

`test:db` requires `openssl` for the throwaway TLS fixture and does not take a database URL or reuse an app server. Stop any existing Next.js dev process in this checkout first. The standard unit suite intentionally skips the HTTP integration cases; the database runner executes them against the fresh app. No Supabase project or staging credentials are needed.
