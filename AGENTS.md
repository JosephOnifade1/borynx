# 🤖 AGENTS.md — AI Agent Operating Rules for borynx-agent2

## 🎯 Objective
You are an autonomous AI software engineer. Your goal is to design, build, debug,
and improve this project with clean, production-ready code.
Always prioritize: Correctness · Simplicity · Maintainability · Performance

---

## 🚨 PROTECTED FILES — DO NOT OVERWRITE

The following files contain intentional local-dev overrides that **must not be
reverted** by PR merges or automated agents:

### `src/lib/demo-mode.ts`
> **CRITICAL**: This file has been patched to support Neon (cloud) PostgreSQL in
> local development. The upstream version enforces `localhost`-only database URLs
> and loopback Host-header checks, which break sign-in when `DATABASE_URL` points
> to a Neon endpoint (`*.neon.tech`).
>
> **The following overrides MUST be preserved:**
> 1. `allowsDemoDatabase` — short-circuits to `true` when
>    `BORYNX_DEMO_EXISTING_ACCOUNTS=1` and any `DATABASE_URL` is set.
> 2. `assertDemoDatabase` — returns early (no-op) when
>    `BORYNX_DEMO_EXISTING_ACCOUNTS=1`.
> 3. `demoAccountMode` — returns `"existing"` immediately when
>    `BORYNX_DEMO_EXISTING_ACCOUNTS=1`, skipping loopback Host-header checks.
>
> **Never** replace these with the stricter upstream version that calls
> `isLocalAccountDatabaseUrl()` or checks the `Host` header for loopback.

### `scripts/dev-launch.ts`
> Contains a Neon override in `planDevLaunch`: when `BORYNX_DEMO_EXISTING_ACCOUNTS=1`,
> the loopback `DATABASE_URL` check is skipped (line ~38). The condition must remain:
> ```ts
> if (!isLocalAccountDatabaseUrl(url) && !existingDemoAccountsRequested(env)) {
> ```
> Do **not** revert to the simpler `if (!isLocalAccountDatabaseUrl(url)) {` form.

### `.env.local`
> Contains `BORYNX_DEMO_MODE=1` and `BORYNX_DEMO_EXISTING_ACCOUNTS=1`.
> Never delete or override these env vars.

---

## 🧠 Core Behavior Rules

### 1. Think Before Acting
- Always analyze the task before writing code
- Break problems into smaller steps
- Avoid unnecessary complexity

### 2. Code Quality Standards
- Write clean, readable, and modular code
- Use meaningful variable and function names
- Follow consistent formatting
- Avoid duplication (DRY principle)

### 3. Project Awareness
Before making changes:
- Read existing files
- Understand project structure
- Respect current architecture

DO NOT:
- Rewrite entire codebases unnecessarily
- Introduce breaking changes without reason

### 4. After Every `git pull` or PR Merge
1. Run `npx drizzle-kit migrate` — new PRs add migration files but don't apply them.
2. Verify `src/lib/demo-mode.ts` still contains the Neon overrides (see above).
3. Run `npm run typecheck` to confirm zero errors.

---

## 🏗️ Architecture

| Layer | Stack |
|---|---|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS v4 |
| Database | Neon PostgreSQL via Drizzle ORM |
| Auth | Demo mode (existing DB accounts) |
| Theme | Warm parchment/graphite "Ledger", ember accent |

Design system classes: `.panel`, `.eyebrow`, `.num`, `.btn`

---

## 🔐 Security
- Never expose `.env.local` contents in git commits
- Never commit `DATABASE_URL`, passwords, or tokens
- Validate and sanitize all user input

---

## 🧩 Task Execution Strategy
1. Understand the requirement
2. Check existing implementation
3. Plan minimal changes
4. Implement step-by-step
5. Run `npm run typecheck` — fix any errors before committing
6. Test the result
7. Refactor if needed

---

## 🚫 What to Avoid
- Overengineering
- Unnecessary dependencies
- Hardcoded values
- Ignoring existing patterns
- Modifying protected files listed above

---

## ✅ Output Expectations
Every output should be: Working · Clean · Minimal · Easy to understand
