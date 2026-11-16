# 📘 Borynx — Tier 3 Implementation Architecture & Guide

**Status:** ✅ Complete & Verified  
**Date:** 2026-11-16  
**Target Environment:** `C:\PROJECTS\Personal_Projects\BORYNX\borynx-agent2`  
**Build & Typecheck Status:** Exit code 0 (Passing)

---

## 🎯 Scope & Objectives
Tier 3 expands community engagement and content creation across Borynx by giving practitioners discoverability tools, space creation capabilities, and engineering-grade writing utilities.

Key pillars implemented in Tier 3:
1. **Practitioner Reputation Leaderboard & Talent Directory (`/leaderboard`)**
2. **Community Creation Workflow & Niche Space Builder (`/b/new` & `POST /api/spaces`)**
3. **Rich Markdown Formatting Toolbar with Real-Time Preview**
4. **Primary Sidebar Navigation & Command Palette Integrations**

---

## 🏆 1. Practitioner Leaderboard & Talent Directory

### 1.1 Backend Endpoint
- **Endpoint:** `GET /api/leaderboard`
- **Supported Query Parameters:**
  - `sort`: `"karma"` (default) | `"solutions"` | `"followers"` | `"recent"`
  - `skill`: Filter by discipline or specialty keyword (e.g. `Engineering`, `DevOps`, `Rust`, `Security`)
  - `verified`: `"1"` filters exclusively for Verified Pros
  - `limit`: Default 40, max 100
- **Computed Metrics:**
  - Evaluates live counts of accepted solutions (`comments.isSolution = true`) and followers (`follows`).
  - Identifies whether the viewing user is currently following each practitioner.
  - Excludes banned accounts.

### 1.2 Frontend Components
- **`LeaderboardView` (`src/components/leaderboard/LeaderboardView.tsx`):**
  - Instant filter tabs: **Top Karma**, **Most Solved**, **Most Followed**, **Newest**.
  - Discipline pill bar: *All, Engineering, Design, DevOps, Data, AI, Security, Product*.
  - Verified Pro toggle checkbox.
  - Highlighted Top 3 podium ranks with custom gold/slate/ember badges.
  - Embedded [`FollowButton`](../src/components/FollowButton.tsx) directly on each row for one-click following.
  - Live hovercard integration with [`UserHoverCard`](../src/components/UserHoverCard.tsx).
- **Server Page (`src/app/leaderboard/page.tsx`):**
  - High-performance server rendering with initial top 40 practitioners.
  - Clean metadata and `PageHeader` framing.

---

## 🚀 2. Community Creation Workflow (Custom Spaces)

### 2.1 Backend Endpoint
- **Endpoint:** `POST /api/spaces`
- **Capabilities:**
  - Requires authenticated session (`requireActor()`).
  - Validates and slugifies URL path (`slugify(slug, 48)`), verifying uniqueness against both `spaces` and `spaceAliases`.
  - Assigns creator as community `owner` in `memberships` table within a safe database transaction.
  - Initializes `memberCount = 1` and evaluates milestone badges for the creator.
  - Enforces access policies: `public`, `restricted`, `private`.

### 2.2 Space Builder Page (`/b/new`)
- **Page (`src/app/b/new/page.tsx`):** Protected route redirecting unauthenticated users to `/login`.
- **Form Component (`src/components/spaces/CreateSpaceForm.tsx`):**
  - **Reactive Brand Hue slider (0–360°)** with real-time gradient badge preview (`b/[slug]`).
  - Auto-slug generator with custom manual override toggle.
  - **Topic tag manager** (add via `Enter` or `,`, removable chips).
  - **Community rule builder** (pre-populated with professional baseline guidelines).
  - Access policy dropdown with clear descriptions.
  - On launch, automatically redirects to the new community room: `/b/[slug]`.
- **Directory Action:** Added a prominent **"Create a space"** primary button on the communities index (`/b`).

---

## ✍️ 3. Rich Markdown Toolbar with Live Preview

### 3.1 Component Architecture
- **`MarkdownToolbar` (`src/components/MarkdownToolbar.tsx`):**
  - Insertion helpers for:
    - **Bold** (`**text**`)
    - *Italic* (`*text*`)
    - Inline code (`` `code` ``)
    - Code block (```` ```lang\ncode\n``` ````)
    - Links (`[title](url)`)
    - Quotes (`> quote`)
    - Bulleted lists (`- item`)
  - Preserves cursor position and selection wrapping.
  - Built-in **"Preview" / "Editing"** toggle button.

### 3.2 Integrated Surfaces
1. **Thread Composer ([`src/components/forms.tsx`](../src/components/forms.tsx) - `PostComposer`):**
   - Added `MarkdownToolbar` above the thread body textarea.
   - Allows writers to preview markdown formatting, code syntax, and external links before submitting.
2. **Comment Threads ([`src/components/post/CommentThread.tsx`](../src/components/post/CommentThread.tsx) - `Composer`):**
   - Added `MarkdownToolbar` to top-level comments and nested reply boxes.
   - Supports live preview within the discussion stream.

---

## ⚡ 4. Navigation & Shortcuts

1. **Sidebar Navigation ([`src/components/shell/Sidebar.tsx`](../src/components/shell/Sidebar.tsx)):**
   - Added **Leaderboard** (`/leaderboard`) with a trophy icon directly in the primary navigation list.
2. **Command Palette ([`src/components/shell/CommandPalette.tsx`](../src/components/shell/CommandPalette.tsx)):**
   - Added `Practitioner leaderboard (/leaderboard)` to the <kbd>Cmd+K</kbd> quick-jump list with dedicated `Trophy` glyph.

---

## 🧪 5. Verification & Testing Evidence
1. **TypeScript Typecheck:**
   ```bash
   npm run typecheck
   # Output: Exit code 0
   ```
2. **Next.js Turbopack Production Build:**
   ```bash
   npm run build
   # Output: Compiled successfully in 9.1s, static pages generated, all dynamic endpoints registered, Exit code 0
   ```
