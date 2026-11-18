# 📚 Borynx Implementation Documentation

This directory contains architectural specifications, implementation blueprints, schema migration records, and verification logs for feature tiers added to Borynx.

---

## 📑 Feature Tier Documentation

- [**Tier 1 Implementation**](./TIER_1_IMPLEMENTATION.md)
  - In-App Notification Engine & Unified Activity Inbox (`/notifications`)
  - Freelancer Follow Network (`/api/users/[username]/follow`) & Following Feed
  - Command Palette Action Shortcuts (<kbd>Cmd+K</kbd>)
  - Migration: `0002_curly_steve_rogers.sql`

- [**Tier 2 Implementation**](./TIER_2_IMPLEMENTATION.md)
  - Interactive Lead Acceptance & Status Lifecycle (`POST /api/leads/[id]/bids/[bidId]/accept`)
  - Reputation & Milestone Karma for Won Leads (+50 karma)
  - Freelancer Profile Editor (`PATCH /api/me`) & Settings Hub (`/settings`)
  - Migration: `0003_silent_spacker_dave.sql`

- [**Tier 3 Implementation**](./TIER_3_IMPLEMENTATION.md)
  - Practitioner Reputation Leaderboard & Talent Directory (`/leaderboard` & `/api/leaderboard`)
  - Community Creation Workflow & Niche Space Builder (`/b/new` & `POST /api/spaces`)
  - Rich Markdown Formatting Toolbar with Real-Time Preview (`MarkdownToolbar`)
  - Primary Sidebar Navigation & Command Palette Integrations

---

## Marketplace Roadmap

- [Phase-by-phase marketplace implementation plan](./RECOMMENDATIONS_IMPLEMENTATION_PLAN.md) — Development-first phases with schema, API contracts, and acceptance checks.
- [Phase 1 lead submission and review](./MARKETPLACE_PHASE_1.md) — Disposable demo walkthrough, confirmed budget and backfill policies, and rollout precautions.
- [Local database runbook](./LOCAL_DATABASE.md) — Phase 0 setup, migration checks, and demo sign-in safeguards.

---

## 🏗️ Technical Stack Summary
- **Framework:** Next.js 16.4.6 (App Router + Turbopack)
- **Runtime:** React 19.2.6
- **Database ORM:** Drizzle ORM 0.45.2 + `pg` (node-postgres)
- **Styling:** Tailwind CSS v4 (`@tailwindcss/postcss`)
- **State & Data Fetching:** TanStack React Query 5.x + Zustand
- **Virtualization:** `@tanstack/react-virtual`
