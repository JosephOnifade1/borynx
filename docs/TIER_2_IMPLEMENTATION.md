# 📘 Borynx — Tier 2 Implementation Architecture & Guide

**Status:** ✅ Complete & Verified  
**Date:** 2026-11-16  
**Target Environment:** `C:\PROJECTS\Personal_Projects\BORYNX\borynx-agent2`  
**Build & Typecheck Status:** Exit code 0 (Passing)

---

> This is a historical implementation note. [Current marketplace rules](./MONETIZATION_PILOT.md#quality-and-reputation-are-not-for-sale) no longer grant karma for a new award.

## 🎯 Scope & Objectives
Tier 2 focuses on completing the client-to-freelancer commercial transaction loop and enabling deep profile personalization. Practitioners and clients on Borynx can now negotiate, award contracts, and manage their identity across the network.

Key pillars implemented in Tier 2:
1. **Interactive Lead Acceptance & Status Lifecycle**
2. **Reputation & Milestone Karma for Won Leads**
3. **Freelancer Profile Editor & Identity Settings Hub (`/settings`)**
4. **Header Navigation & Command Palette Integration**

---

## 🗄️ 1. Database Schema & Migrations

### 1.1 Schema Additions
In [`src/db/schema.ts`](../src/db/schema.ts):

- **Table `leads`:**
  - Added `assignedUserId: integer("assigned_user_id").references(() => users.id, { onDelete: "set null" })`
  - Added `acceptedBidId: integer("accepted_bid_id")`
- **Table `leadBids`:**
  - Added `isAccepted: boolean("is_accepted").default(false).notNull()`

### 1.2 Migration
- Generated migration: `drizzle/0003_silent_spacker_dave.sql`
- Applied cleanly to live PostgreSQL via `npx drizzle-kit migrate`.

---

## 💼 2. Lead Acceptance & Status Lifecycle

### 2.1 Backend Endpoints
- **Accept Bid:** `POST /api/leads/[id]/bids/[bidId]/accept`
  - Authorization: Restricted to the lead creator or moderators/admins.
  - In a database transaction:
    1. Resets any previous accepted bid on the lead.
    2. Marks the target bid with `isAccepted = true`.
    3. Updates `leads`: `acceptedBidId = bidId`, `assignedUserId = bid.userId`, and transitions status to `closed`.
    4. Awards **+50 karma** (`lead_bid_accepted`) to the winning freelancer and evaluates milestone badges.
    5. Dispatches an in-app notification to the winning freelancer:  
       `"🎉 [Poster] accepted your bid on '[Lead Title]'! (+50 karma)"`
- **Update Lead Status:** `PATCH /api/leads/[id]/status`
  - Restricted to lead owner or staff.
  - Transitions lead between `"open"`, `"in_review"`, and `"closed"`.

### 2.2 Client UI Components
- **`LeadStatusSelector` (`src/components/leads/LeadPosterControls.tsx`):**
  - Instant dropdown allowing the poster to cycle lead status without page reloads.
- **`AcceptBidButton` (`src/components/leads/LeadPosterControls.tsx`):**
  - Placed alongside each bid in the poster's dashboard.
  - Includes a 2-step inline confirmation mechanism (`Award lead to [Freelancer]? Confirm / Cancel`) to prevent accidental clicks.
  - Switches to a glowing gold trophy badge (`✓ Accepted Winning Bid`) once awarded.
- **Lead Page Award Banner (`src/app/l/[leadId]/[[...rest]]/page.tsx`):**
  - Displays a trophy alert banner when a lead is awarded:  
    *"🏆 Lead Awarded: A bid by f/[freelancer] was accepted by the poster."*
  - Automatically highlights the accepted bid row with a gold accent border.

---

## 🎨 3. Freelancer Profile Editor & Identity Settings Hub

### 3.1 Profile Update API (`PATCH /api/me`)
In [`src/app/api/me/route.ts`](../src/app/api/me/route.ts):
- Requires active user session.
- Validates and updates:
  - `displayName`: 2–80 characters.
  - `headline`: Up to 140 characters.
  - `bio`: Up to 2,000 characters.
  - `skills`: JSON array of up to 20 skill strings (max 30 chars each).
  - `githubUrl`: Sanitized URL or null.
  - `portfolioUrl`: Sanitized URL or null.
  - `avatarHue`: Integer 0–360°.

### 3.2 Modal & Live Preview (`src/components/profile/EditProfileModal.tsx`)
- Triggered by an **"Edit Profile"** button visible on `/f/[username]` when viewing one's own profile (`isSelf`).
- Features:
  - Interactive **Avatar Hue slider (0–360°)** with a real-time reactive avatar preview.
  - Dedicated **Skills tag manager** (add via `Enter` / `,`, removable chip tags).
  - Form validation with error toasts and TanStack Query cache invalidation.

### 3.3 Dedicated Settings Page (`src/app/settings/page.tsx`)
- Accessible via `/settings`, Header profile menu, or <kbd>Cmd+K</kbd>.
- Summarizes the practitioner's active identity, karma balance, bio, skills, and portfolio connections.
- Embeds the `EditProfileModal` directly for seamless updates.

---

## ⚡ 4. Navigation & Command Palette Updates

1. **Header Menu ([`src/components/shell/Header.tsx`](../src/components/shell/Header.tsx)):**
   - Added **Settings** (`/settings`) directly into the user account dropdown.
2. **Command Palette ([`src/components/shell/CommandPalette.tsx`](../src/components/shell/CommandPalette.tsx)):**
   - Added `Profile settings (/settings)` to the quick-jump list with dedicated `Settings` icon.

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
   # Output: Generating static pages (1/1), compiled successfully in 9.8s, Exit code 0
   ```
3. **Database Migration Ledger:**
   - Applied `0003_silent_spacker_dave.sql` cleanly to PostgreSQL.
