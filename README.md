# ⚡ Borynx

> **The outcome-driven network for tech freelancers.**  
> Vertical communities, a live contract and bounty lead marketplace, reputation ledgers, and verified practitioner portfolios.

---

## 🌟 Overview

Borynx is built specifically for tech freelancers (Engineering, Design, DevOps, Data, AI, Security, Product) who want high signal-to-noise discussions, direct marketplace opportunities, and a transparent reputation ledger based on solved problems rather than vanity metrics.

### Key Capabilities
- **Vertical Communities (`/b`):** Focused working rooms for specialized disciplines with custom rules, brand hues, and access policies.
- **Leads Marketplace (`/l`):** Contracts, bounties, and roles with budget tracking, verified trust signals, pitch submissions, and award workflows.
- **Practitioner Leaderboard (`/leaderboard`):** Community ranking based on earned karma, accepted solutions, and peer follows.
- **Notification Engine (`/notifications`):** In-app real-time notifications for replies, solution acceptance, lead bids, and new followers.
- **Freelancer Profiles (`/f/:username`):** Identity showcases featuring achievement badges, verified marks, karma balances, skills, and portfolio links.
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

### 2. Start the disposable local demo

```bash
npm run dev:demo
```

Open [http://127.0.0.1:3000/login](http://127.0.0.1:3000/login). Choose the fictional **Demo Buyer**, either **Demo Bidder**, **Demo Reviewer**, or **Demo Observer**. The command starts its own loopback PostgreSQL with a random password and applies the migration journal. It ignores any existing `DATABASE_URL` and discards the demo data on normal shutdown. Run as a normal user, not root. The embedded test database was verified on Linux x64; it requires a supported native binary for your platform.

For a longer-lived **local-only** setup, create an empty PostgreSQL database named `borynx_demo` (or `borynx_demo_<suffix>`), copy `.env.example` to `.env.local`, set the loopback `DATABASE_URL` and set `BORYNX_DEMO_MODE=1`. Then run `npm run dev`. Keep the URL free of query options and never import live data into this database. `next start` (production mode) never enables demo sign-in or seeding, even if this flag is present. Real sign-in is not available yet.

### 3. Verify the checkout

```bash
npm test                 # unit tests; no PostgreSQL needed
npm run typecheck
npm run lint
npm run build
npm run test:db          # temporary PostgreSQL + HTTP integration tests
```

Stop the dev app before running `test:db` so its Next.js dev build directory is free. The suite starts its own database and app; no credential or database argument is needed. See the [local database runbook](./docs/LOCAL_DATABASE.md) for ledger validation, upgrade coverage, and the demo-mode boundary.

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
| `npm run dev` | Start Next.js against your configured database (demo mode is opt-in) |
| `npm run dev:demo` | Start an isolated development app with disposable PostgreSQL |
| `npm run build` | Compile optimized production build |
| `npm run start` | Start production server |
| `npm run typecheck` | Run TypeScript compiler validation |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest unit tests |
| `npm run test:db` | Test fresh and legacy migrations and demo gating on disposable PostgreSQL |
| `npx drizzle-kit generate` | Generate SQL migration from schema |
| `npm run db:migrate` | Verify the Drizzle ledger and apply pending migrations to the explicitly configured database |
| `npx drizzle-kit studio` | Launch local visual database browser |

---

## 📄 License
MIT
