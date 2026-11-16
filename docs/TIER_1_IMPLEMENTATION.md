# 📘 Borynx — Tier 1 Implementation Architecture & Guide

**Status:** ✅ Complete & Verified  
**Date:** 2026-11-16  
**Target Environment:** `C:\PROJECTS\Personal_Projects\BORYNX\borynx-agent2`  
**Build & Typecheck Status:** Exit code 0 (Passing)

---

## 🎯 Scope & Objectives
Tier 1 introduced foundational social and real-time interaction loops to Borynx without compromising its minimalist, high-density terminal-adjacent UI philosophy. The milestone focused on three pillars:

1. **In-App Notification Engine & Unified Activity Inbox**
2. **Freelancer Follow Network & Personalised Following Feed**
3. **Command Palette (<kbd>Cmd+K</kbd>) Action Shortcuts**

---

## 🗄️ 1. Database Schema & Migrations

### 1.1 Enumerations & Tables Added
In [`src/db/schema.ts`](../src/db/schema.ts):

```typescript
export const notificationTypeEnum = pgEnum("notification_type", [
  "comment_reply",
  "solution_accepted",
  "lead_bid",
  "karma_milestone",
  "user_follow",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
    type: notificationTypeEnum("type").notNull(),
    entityType: varchar("entity_type", { length: 32 }), // 'post' | 'comment' | 'lead' | 'user'
    entityId: integer("entity_id"),
    message: text("message").notNull(),
    href: varchar("href", { length: 255 }).notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
    index("notifications_user_read_idx").on(t.userId, t.isRead),
  ],
);

export const follows = pgTable(
  "follows",
  {
    followerId: integer("follower_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    followingId: integer("following_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followingId] }),
    index("follows_follower_idx").on(t.followerId),
    index("follows_following_idx").on(t.followingId),
  ],
);
```

### 1.2 Migration
- Migration generated: `drizzle/0002_curly_steve_rogers.sql`
- Applied using `npx drizzle-kit migrate` directly to PostgreSQL with zero schema divergence.

---

## 👥 2. Freelancer Follow Network & Following Feed

### 2.1 Follow API
- **Endpoint:** `POST /api/users/[username]/follow`
- **Behavior:**
  - Toggles follow status between the authenticated user and the target freelancer.
  - Automatically prevents self-follows (`400 Bad Request`).
  - Dispatches a `user_follow` notification to the target user when followed.
  - Returns `{ following: boolean, followerCount: number }`.
- **Query Endpoint:** `GET /api/users/[username]/follow` returns `{ following, followerCount, followingCount }`.
- **Enhanced Profile Endpoint:** `GET /api/users/[username]` now returns `followerCount` and `isFollowing` for rapid client rendering without cascading requests.

### 2.2 Follow UI Components
- **`FollowButton` (`src/components/FollowButton.tsx`):**
  - Uses TanStack Query with optimistic cache updates for instantaneous UI response.
  - Switches from `Follow` (primary ember style) to `Following` (sunken border style).
  - On hover over `Following`, transforms into an `Unfollow` action with subtle danger styling.
  - Displays optionally on profile headers and `UserHoverCard`.
- **User Hover Card Integration (`src/components/UserHoverCard.tsx`):**
  - Displays 4 clean metrics: `karma`, `followers`, `threads`, `solved`.
  - Embeds the `FollowButton` directly into the hovercard header.
- **Profile Header Integration (`src/app/f/[username]/page.tsx`):**
  - Displays the live follower count in the profile statistics counter.
  - Houses the prominent `FollowButton` alongside verified marks and roles.

### 2.3 Following Feed
- **Query Support (`src/lib/queries.ts`):**
  - `listPosts` accepts `followingUserId`.
  - When set, dynamically joins `follows` where `follows.followingId = posts.authorId AND follows.followerId = opts.followingUserId`.
- **Home Feed Tabs (`src/app/page.tsx`):**
  - If a user is logged in, a top navigation bar allows toggling between **All Threads** and **Following**.
  - URL persistence: `/?feed=following` retains sort parameters (`?sort=hot|new|top`).
  - Empty state informs users: *"Follow freelancers on their profiles or in threads to see their posts here."*

---

## 🔔 3. In-App Notification Engine & Inbox

### 3.1 Dispatch Service (`src/lib/notifications.ts`)
- `createNotification(params, tx)`:
  - Guarded against self-actions (`params.userId === params.actorId` returns `null` immediately).
  - Can participate in existing database transactions.
- `listNotifications(userId, limit)`: Returns recent notifications left-joined with actor details (`avatarHue`, `displayName`, `username`, `isVerified`).
- `getUnreadNotificationCount(userId)`: Fast index-backed count of unread items.
- `markNotificationsAsRead(userId, ids)`: Marks specific notification IDs or all unread items as read.

### 3.2 Integrated Event Triggers
1. **Thread Reply & Comment Reply:**
   - In [`src/app/api/posts/[id]/comments/route.ts`](../src/app/api/posts/[id]/comments/route.ts):
   - When a comment is created on a thread, the thread author is notified (`comment_reply`).
   - If the comment is a nested reply (`parentId`), the parent comment author is notified if distinct from the thread author.
2. **Solution Accepted:**
   - In [`src/lib/services.ts`](../src/lib/services.ts) (`markSolution`):
   - When a thread author marks a comment as the solution, the comment author is notified (`solution_accepted`) highlighting the karma award.
3. **Lead Pitch / Bid Submitted:**
   - In [`src/app/api/leads/[id]/bids/route.ts`](../src/app/api/leads/[id]/bids/route.ts):
   - When a freelancer submits a pitch on a marketplace lead, the lead creator is notified (`lead_bid`).
4. **User Followed:**
   - In [`src/app/api/users/[username]/follow/route.ts`](../src/app/api/users/[username]/follow/route.ts):
   - Dispatches a `user_follow` notification to the followed profile.

### 3.3 Header Notification Bell (`src/components/shell/NotificationBell.tsx`)
- Placed in the fixed header next to the theme toggle and profile menu.
- Displays an animated ember pill badge displaying unread count (`1`, `2`, `9+`).
- Automatically polls every 30 seconds and refreshes on window focus.
- Clicking opens a quick preview popover displaying the 10 most recent updates with avatar icons, time-ago stamps, unread indicator dots, and a **"Mark all read"** action.
- Direct link to the full inbox.

### 3.4 Notifications Inbox (`src/app/notifications/page.tsx`)
- Server-rendered page protected by session authentication.
- Filter tabs: **All** vs. **Unread**.
- Categorised badges: `Reply`, `Solution`, `Lead Pitch`, `Follower`.
- Interactive `NotificationsInbox` client component with 1-click read acknowledgment when following links.

---

## ⚡ 4. Command Palette Shortcuts

In [`src/components/shell/CommandPalette.tsx`](../src/components/shell/CommandPalette.tsx):
- Triggered by <kbd>Cmd+K</kbd> / <kbd>Ctrl+K</kbd> or header search input.
- Added quick jump items with custom icons:
  - **Notifications inbox** (`/notifications`) — `Bell`
  - **Saved threads** (`/saved`) — `Bookmark`
  - **Post a lead** (`/l/new`) — `PlusCircle`
  - **Marketplace leads** (`/l`) — `Briefcase`
  - **Browse spaces** (`/b`) — `Compass`
  - **Your profile** (`/me`) — `User`
  - **Achievements** (`/achievements`) — `Award`

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
   # Output: Generating static pages (1/1), all dynamic routes rendered, Exit code 0
   ```
3. **PostgreSQL Ledger Audit:**
   - Executed queries against live tables `notifications` and `follows` via `node-postgres` pool.
   - Verified constraints, cascade deletions, and index usage.
