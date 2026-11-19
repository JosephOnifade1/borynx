# ⚡ Borynx

> **The outcome-driven network for tech freelancers.**  
> Vertical communities, a live contract and bounty lead marketplace, reputation ledgers, and verified practitioner portfolios.

---

## 🌟 Overview

Borynx is built specifically for tech freelancers (Engineering, Design, DevOps, Data, AI, Security, Product) who want high signal-to-noise discussions, direct marketplace opportunities, and a transparent reputation ledger based on solved problems rather than vanity metrics.

### Key Capabilities
- **Vertical Communities (`/b`):** Focused working rooms for specialized disciplines with custom rules, brand hues, and access policies.
- **Leads Marketplace (`/l`):** Find contracts, bounties, and roles with budget and skill filters, and save leads privately. Manage pitches and awards, then share [private kickoff details](./docs/MARKETPLACE_KICKOFF.md) with the winner. See the [discovery walkthrough](./docs/MARKETPLACE_PHASE_5.md).
- **Practitioner Leaderboard (`/leaderboard`):** Community ranking based on earned karma, accepted solutions, and peer follows.
- **Notification Engine (`/notifications`):** In-app real-time notifications for replies, solution acceptance, lead bids, and new followers.
- **Adaptive Profiles (`/f/:username`):** Show hiring activity, freelance availability and rates, and up to six curated [portfolio projects](./docs/MARKETPLACE_PHASE_4_PROJECTS.md).
- **Command Palette (<kbd>Cmd+K</kbd> / <kbd>Ctrl+K</kbd>):** Instant keyboard navigation across communities, threads, leads, and settings.

---

## 🛠️ Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router + Turbopack)
- **UI Library:** [React 19](https://react.dev/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Database & ORM:** [PostgreSQL](https://www.postgresql.org/) via [Drizzle ORM](https://orm.drizzle.team/)
- **Data Fetching & Cache:** [TanStack React Query v5](https://tanstack.com/query)
- **Virtualization:** [@tanstack/react-virtual](https://tanstack.com/virtual)
- **Icons:** [Lucide React](https://lucide.dev/)

---

## 🚀 Getting Started

### 1. Install the pinned toolchain

Use Node.js 22 (22.12 or newer within the 22.x line) and npm 10. The checkout is verified with Node **22.22.3** (`.nvmrc`) and npm **10.9.8**. With nvm, run `nvm install` and `nvm use` from the repository root, then:

```bash
npm ci
```

### 2. Start local development

> **Demo isolation caveat:** The current `main` baseline regressed demo sign-in isolation (`65fc188`). Until fixed, use only disposable data on loopback; don't proxy or deploy demo servers. See the [local database runbook](./docs/LOCAL_DATABASE.md).

**Already have demo accounts?** Keep your existing local PostgreSQL `DATABASE_URL` in `.env.local` (any test database name is fine). Run `npm run dev`, then open [http://127.0.0.1:3000/login](http://127.0.0.1:3000/login) and choose or type your handle. No demo flags are needed. If you copied an older `.env.example` that sets `BORYNX_DEMO_MODE=0`, remove that line to use the default; `0` remains an explicit opt-out. Your account ID and role stay the same, and startup does not add fixture accounts or posts. Pending migrations can still apply, so back up your local database first. Use a loopback connection without URL options, use test data only, and don't proxy this server.

**Starting without a test database?** Run `npm run dev:demo` and open the same `/login` address. Choose the fictional **Demo Buyer**, either **Demo Bidder**, **Demo Reviewer**, or **Demo Observer**. This command ignores your `DATABASE_URL`, starts its own local PostgreSQL, and discards its data on normal shutdown. Run as a normal user, not root. The embedded database requires a supported native binary (verified on Linux x64).

Both commands keep email sign-in off. Demo sign-in is unavailable in production.

### 3. Verify the checkout

```bash
npm test                 # unit tests; no PostgreSQL needed
npm run typecheck
npm run lint
npm run build
npm run test:db          # temporary PostgreSQL + HTTP integration tests
```

Stop the dev app before running `test:db` so its Next.js dev build directory is free. The suite uses `openssl` and starts its own database, app, and HTTPS email-provider double; no real project or credential is needed. See the [local database runbook](./docs/LOCAL_DATABASE.md) for ledger validation, upgrade coverage, and the demo-mode boundary. The [marketplace walkthrough](./docs/MARKETPLACE_PHASE_2.md) covers drafting, review, private pitches, one award, and recorded completion. [Verified email intake](./docs/MARKETPLACE_PHASE_3.md) is off by default and must be rehearsed on approved staging before any real mail or outside submissions.

---

## 📖 Feature Implementation Documentation

Detailed architectural specs, schema changes, and migration logs for all developed tiers are available in the [`docs/`](./docs) folder:
- [**docs/README.md**](./docs/README.md) — Index & Overview
- [**docs/TIER_1_IMPLEMENTATION.md**](./docs/TIER_1_IMPLEMENTATION.md) — Notifications, Follow Network & Following Feed
- [**docs/TIER_2_IMPLEMENTATION.md**](./docs/TIER_2_IMPLEMENTATION.md) — Lead Acceptance & Status Lifecycle, Karma Awards, Profile Settings
- [**docs/TIER_3_IMPLEMENTATION.md**](./docs/TIER_3_IMPLEMENTATION.md) — Practitioner Leaderboard, Custom Space Creation, Markdown Toolbar

---

## 📜 Scripts

| Command | Action |
|---|---|
| `npm run dev` | Start on loopback with existing accounts from your local test database |
| `npm run dev:demo` | Start an isolated development app with disposable PostgreSQL and fictional accounts |
| `npm run build` | Compile optimized production build |
| `npm run start` | Start production server |
| `npm run typecheck` | Run TypeScript compiler validation |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest unit tests |
| `npm run test:db` | Test migrations, demo sign-in, marketplace and thread actions, profile settings, and staged email intake on disposable services |
| `npm run test:db -- --profiles-only` | Verify adaptive profiles and privacy on an upgraded disposable database |
| `npm run test:db -- --projects-only` | Verify portfolio privacy, cover handling, moderation, and ordering on disposable services |
| `npm run test:db -- --lead-discovery-only` | Verify lead filtering, pagination, private saves, and the Phase 5 upgrade |
| `npm run test:db -- --lead-reviews-only` | Verify completed-award reviews, moderation, and the Phase 6 upgrade |
| `npm run test:db -- --kickoff-only` | Verify private post-award kickoff, participant access, and the `0012` → `0013` upgrade |
| `npx drizzle-kit generate` | Generate SQL migration from schema |
| `npm run db:migrate` | Verify the Drizzle ledger and apply pending migrations to the explicitly configured database |
| `npm run db:prune-email` | Scrub expired intake content and prune receipts, send reservations and sessions on the explicitly configured database |
| `npx drizzle-kit studio` | Launch local visual database browser |

---

## 📄 License
MIT
