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

### 1. Prerequisites
- Node.js 18+ (Node 20+ recommended)
- PostgreSQL database (local or hosted via Neon, Supabase, etc.)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/your-username/borynx.git
cd borynx

# Install dependencies
npm install
```

### 3. Environment Setup
Copy the example environment file and add your PostgreSQL connection URL:
```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/borynx_db?sslmode=require
```

### 4. Database Migrations
Run Drizzle migrations to initialize all tables, enums, and indexes:
```bash
npx drizzle-kit migrate
```

### 5. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

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
| `npm run dev` | Start Next.js Turbopack development server |
| `npm run build` | Compile optimized production build |
| `npm run start` | Start production server |
| `npm run typecheck` | Run TypeScript compiler validation |
| `npx drizzle-kit generate` | Generate SQL migration from schema |
| `npx drizzle-kit migrate` | Apply pending migrations to PostgreSQL |
| `npx drizzle-kit studio` | Launch local visual database browser |

---

## 📄 License
MIT
