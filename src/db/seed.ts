import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  badges,
  comments,
  leads,
  memberships,
  posts,
  reports,
  spaceAliases,
  spaces,
  userAliases,
  users,
  votes,
  type LeadKind,
  type PostKind,
} from "@/db/schema";
import { BADGE_DEFINITIONS } from "@/lib/badges";
import { isDemoMode } from "@/lib/demo-mode";
import { DEMO_PERSONAS } from "@/lib/demo-personas";
import { evaluateBadges, type Executor } from "@/lib/services";
import { slugify } from "@/lib/utils";

const HOUR = 3_600_000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR);

const SEED_LOCK = 4_242_002;

export type SeedResult = "inserted" | "present" | "disabled";

/**
 * Idempotent, transactional seed. Concurrent callers serialise on an advisory lock, and a failure
 * part-way through rolls back completely — the database is either fully seeded or untouched.
 */
export async function seedDatabase(): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SEED_LOCK}::bigint)`);
    await seedBadges(tx);
    if (!isDemoMode()) return "disabled";

    const [{ c }] = await tx.select({ c: count() }).from(users);
    if (c === 0) await seedContent(tx);
    // Add the test personas on upgraded demo databases too. Never rewrite an existing user.
    await tx.insert(users).values(DEMO_PERSONAS.map((persona) => ({ ...persona })))
      .onConflictDoNothing({ target: users.username });
    return c === 0 ? "inserted" : "present";
  });
}

/** The badge catalogue is upserted on every boot so definition edits roll out without a migration. */
async function seedBadges(tx: Executor): Promise<void> {
  for (const def of BADGE_DEFINITIONS) {
    await tx
      .insert(badges)
      .values({ slug: def.slug, name: def.name, description: def.description, category: def.category, icon: def.icon, threshold: def.threshold, tier: def.tier })
      .onConflictDoUpdate({
        target: badges.slug,
        set: { name: def.name, description: def.description, category: def.category, icon: def.icon, threshold: def.threshold, tier: def.tier },
      });
  }
}

async function seedContent(tx: Executor): Promise<void> {

  const seededUsers = await tx
    .insert(users)
    .values([
      {
        username: "mara_k",
        displayName: "Mara Kowalczyk",
        headline: "Staff backend engineer · distributed systems, Go, Postgres at scale",
        bio: "15 years shipping backend systems for fintech and marketplaces. I consult on architecture reviews, incident retros, and the migrations nobody else wants to own.",
        avatarHue: 18,
        skills: ["Go", "PostgreSQL", "Distributed systems", "Kafka", "Architecture review"],
        role: "admin",
        isVerified: true,
        githubUrl: "https://github.com/mara-k",
        portfolioUrl: "https://marak.dev",
        karma: 1420,
        createdAt: ago(24 * 400),
      },
      {
        username: "devrim",
        displayName: "Devrim Aslan",
        headline: "Full-stack TypeScript · Next.js, Postgres, event-driven systems",
        bio: "Contract engineer for SaaS and marketplace teams. I ship boring, well-tested systems and leave better CI than I found.",
        avatarHue: 200,
        skills: ["TypeScript", "Next.js", "PostgreSQL", "tRPC", "Playwright"],
        role: "moderator",
        isVerified: true,
        githubUrl: "https://github.com/devrim",
        karma: 860,
        createdAt: ago(24 * 310),
      },
      {
        username: "ines_ml",
        displayName: "Inès Fortier",
        headline: "AI/ML engineer · LLM pipelines, evals, MLOps on Kubernetes",
        bio: "I take prototypes from a notebook to a monitored production service. RAG, fine-tuning, eval harnesses, cost control.",
        avatarHue: 150,
        skills: ["Python", "PyTorch", "LangGraph", "MLflow", "Kubernetes"],
        isVerified: true,
        githubUrl: "https://github.com/inesf",
        karma: 540,
        createdAt: ago(24 * 220),
      },
      {
        username: "tomasz_ops",
        displayName: "Tomasz Nowak",
        headline: "DevOps / SRE · AWS, Terraform, observability, cost reduction",
        bio: "Fractional SRE for Series A–C startups. I cut cloud bills and pager volume, usually in that order.",
        avatarHue: 40,
        skills: ["AWS", "Terraform", "Kubernetes", "Grafana", "FinOps"],
        karma: 310,
        createdAt: ago(24 * 180),
      },
      {
        username: "priya.builds",
        displayName: "Priya Raman",
        headline: "Senior product designer & front-end · design systems, accessibility",
        bio: "I make product teams faster with design systems that developers actually use. Figma to React, WCAG 2.2 by default.",
        avatarHue: 290,
        skills: ["Figma", "React", "Design systems", "Accessibility", "Storybook"],
        karma: 275,
        createdAt: ago(24 * 140),
      },
      {
        username: "oluwaseun",
        displayName: "Oluwaseun Adeyemi",
        headline: "Cybersecurity consultant · pentesting, SOC 2, cloud security posture",
        bio: "Offensive security background, now helping startups pass audits without theatre. AppSec reviews, threat modelling, IR tabletop.",
        avatarHue: 95,
        skills: ["Penetration testing", "SOC 2", "Threat modelling", "Burp Suite", "AWS security"],
        karma: 190,
        createdAt: ago(24 * 90),
      },
      {
        username: "lena_pm",
        displayName: "Lena Berg",
        headline: "Product manager going technical · analytics, SQL, discovery",
        bio: "Fractional PM for early-stage B2B. Learning to read the codebase so I stop asking engineers dumb questions.",
        avatarHue: 330,
        skills: ["Product discovery", "SQL", "Amplitude", "Roadmapping"],
        karma: 42,
        createdAt: ago(24 * 20),
      },
      {
        username: "spamlord99",
        displayName: "Quick Money Ltd",
        headline: "GUARANTEED INCOME",
        bio: "Banned for marketplace fraud.",
        avatarHue: 0,
        skills: [],
        karma: -30,
        isBanned: true,
        bannedAt: ago(48),
        banReason: "Posting fraudulent bounties requiring upfront deposits",
        warningCount: 2,
        createdAt: ago(24 * 5),
      },
    ])
    .returning();

  const u = Object.fromEntries(seededUsers.map((x) => [x.username, x]));
  await tx.insert(userAliases).values([
    { alias: "mara-kowalczyk", userId: u.mara_k.id },
    { alias: "devrim_aslan", userId: u.devrim.id },
    { alias: "priya", userId: u["priya.builds"].id },
    { alias: "ines_auto", userId: u.ines_ml.id },
  ]);

  const seededSpaces = await tx
    .insert(spaces)
    .values([
      {
        slug: "software-engineering",
        name: "Software Engineering",
        tagline: "Backend, architecture, APIs, and systems that stay up",
        description: "Architecture reviews, scaling war stories, API design, testing strategy, and the engineering judgement that separates seniors from staff.",
        topics: ["backend", "architecture", "apis", "testing", "postgres", "go", "typescript"],
        rules: ["Post code, not screenshots of code", "Mark the comment that solved it", "Rate talk belongs in b/rates-and-contracts"],
        accentHue: 205,
        createdById: u.mara_k.id,
        createdAt: ago(24 * 380),
      },
      {
        slug: "frontend-and-mobile",
        name: "Front-end & Mobile",
        tagline: "React, Next.js, React Native, Swift, Flutter, and the browser",
        description: "Web and mobile product engineering: rendering strategies, state management, performance budgets, app store realities.",
        topics: ["react", "nextjs", "react-native", "swift", "flutter", "performance"],
        rules: ["Include a reproduction for bugs", "Framework wars get locked"],
        accentHue: 275,
        createdById: u.devrim.id,
        createdAt: ago(24 * 300),
      },
      {
        slug: "devops-cloud",
        name: "DevOps & Cloud",
        tagline: "Infrastructure as code, Kubernetes, observability, cloud cost",
        description: "SRE and platform engineers on contract. Incidents, IaC patterns, CI/CD pipelines, and FinOps.",
        topics: ["aws", "gcp", "kubernetes", "terraform", "observability", "finops"],
        rules: ["Redact account IDs and hostnames", "Post the postmortem, not just the outage"],
        accentHue: 42,
        createdById: u.tomasz_ops.id,
        createdAt: ago(24 * 290),
      },
      {
        slug: "design-ux",
        name: "UI/UX Design",
        tagline: "Product design, design systems, research, accessibility",
        description: "Designers who ship. Design-to-code handoff, systems thinking, usability research, and pricing design work.",
        topics: ["figma", "design-systems", "accessibility", "research", "motion"],
        rules: ["Critique the work, not the person", "Share process, not just the final frame"],
        accentHue: 330,
        createdById: u["priya.builds"].id,
        createdAt: ago(24 * 210),
      },
      {
        slug: "security",
        name: "Cybersecurity",
        tagline: "AppSec, pentesting, compliance, incident response",
        description: "Restricted space for vetted security practitioners. Disclosure etiquette applies.",
        privacy: "restricted",
        topics: ["appsec", "pentest", "soc2", "cloud-security", "incident-response"],
        rules: ["Vetted members only", "No live exploit details for unpatched targets"],
        accentHue: 95,
        createdById: u.oluwaseun.id,
        createdAt: ago(24 * 85),
      },
      {
        slug: "data-and-ai",
        name: "Data Science & AI/ML",
        tagline: "LLM engineering, MLOps, analytics, data platforms",
        description: "From dbt models to fine-tuned models. Evals, retrieval, cost control, and data engineering for people who are paid by the outcome.",
        topics: ["llm", "mlops", "rag", "dbt", "python", "evals"],
        rules: ["Share the eval numbers, not just the demo", "Disclose when output is model-generated"],
        accentHue: 150,
        createdById: u.ines_ml.id,
        createdAt: ago(24 * 200),
      },
      {
        slug: "product-management",
        name: "Product & Technical Consulting",
        tagline: "Fractional PMs, technical consultants, and engineering leadership",
        description: "Discovery, roadmapping, stakeholder management, and the consulting craft of being right early and quietly.",
        topics: ["product", "discovery", "consulting", "leadership", "analytics"],
        rules: ["Anonymise clients", "No frameworks without a story"],
        accentHue: 18,
        createdById: u.lena_pm.id,
        createdAt: ago(24 * 120),
      },
      {
        slug: "rates-and-contracts",
        name: "Rates & Contracts",
        tagline: "Pricing, negotiation, and the clauses that saved a gig",
        description: "Anonymous-friendly discussion of day rates, retainers, IP clauses, and payment terms across tech disciplines.",
        topics: ["pricing", "contracts", "negotiation", "retainers"],
        rules: ["Currency + region on every rate"],
        accentHue: 240,
        createdById: u["priya.builds"].id,
        createdAt: ago(24 * 120),
      },
    ])
    .returning();
  const s = Object.fromEntries(seededSpaces.map((x) => [x.slug, x]));
  await tx.insert(spaceAliases).values([
    { alias: "webdev", spaceId: s["frontend-and-mobile"].id },
    { alias: "frontend", spaceId: s["frontend-and-mobile"].id },
    { alias: "backend", spaceId: s["software-engineering"].id },
    { alias: "infra", spaceId: s["devops-cloud"].id },
    { alias: "ml", spaceId: s["data-and-ai"].id },
    { alias: "ux", spaceId: s["design-ux"].id },
  ]);

  const everyone = seededUsers.filter((x) => !x.isBanned);
  const memberRows: Array<{ userId: number; spaceId: number; modRole: "owner" | "moderator" | null; joinedAt: Date }> = [];
  for (const sp of seededSpaces) {
    for (const person of everyone) {
      if (sp.slug === "security" && !["oluwaseun", "mara_k", "devrim", "tomasz_ops"].includes(person.username)) continue;
      const isOwner = sp.createdById === person.id;
      const isMod = (sp.slug === "frontend-and-mobile" && person.username === "priya.builds") || (sp.slug === "software-engineering" && person.username === "devrim");
      memberRows.push({ userId: person.id, spaceId: sp.id, modRole: isOwner ? "owner" : isMod ? "moderator" : null, joinedAt: ago(24 * 30) });
    }
  }
  await tx.insert(memberships).values(memberRows);
  for (const sp of seededSpaces) {
    const n = memberRows.filter((m) => m.spaceId === sp.id).length;
    await tx.update(spaces).set({ memberCount: n }).where(eq(spaces.id, sp.id));
  }

  type SeedPost = { space: string; author: string; title: string; body: string; kind: PostKind; up: number; down: number; hours: number };
  const postSeeds: SeedPost[] = [
    { space: "software-engineering", author: "mara_k", title: "Postgres row-level locking patterns for marketplace bids (with benchmarks)", body: "Three patterns compared: `SELECT ... FOR UPDATE`, advisory locks, and optimistic versioning.\n\n```sql\nSELECT * FROM leads WHERE id = $1 FOR UPDATE SKIP LOCKED;\n```\n\n**TL;DR:** optimistic versioning wins below ~200 writes/sec on a hot row. Advisory locks win above, *if* you keep them inside one transaction (PgBouncer transaction mode will bite you otherwise).\n\nThanks to f/devrim for the PgBouncer repro.", kind: "resource", up: 231, down: 11, hours: 70 },
    { space: "software-engineering", author: "lena_pm", title: "Is it reasonable to ask a contractor for a fixed price on an unknown codebase?", body: "I am the client in this scenario. Trying to be fair, but finance wants a number.", kind: "discussion", up: 34, down: 12, hours: 8 },
    { space: "software-engineering", author: "devrim", title: "Zero-downtime migration playbook: how we split a 2TB monolith table without a maintenance window", body: "Dual-write, backfill in batches keyed by primary key range, verify with checksums, flip reads behind a flag, drop the old path two weeks later.\n\n1. Add the new table and **triggers** for dual writes\n2. Backfill with `LIMIT 5000` batches and `pg_sleep` throttling\n3. Compare row counts + sampled hashes\n4. Flip reads via feature flag\n\nFull runbook in the gist linked below. https://github.com/devrim/zero-downtime-runbook", kind: "resource", up: 184, down: 6, hours: 30 },
    { space: "software-engineering", author: "tomasz_ops", title: "Help: API p99 latency doubles every Monday 09:00 UTC — nothing in deploy history", body: "Node service on EKS, Postgres RDS. CPU flat. Connection pool saturates for ~20 minutes. Weekly cron? Autovacuum? Looking for where to look.", kind: "help", up: 41, down: 2, hours: 6 },
    { space: "frontend-and-mobile", author: "priya.builds", title: "Client wants 'just a quick Stripe integration'. Scope it with me?", body: "Subscriptions, proration, EU VAT, invoices, dunning. They budgeted 2 days. How do you reframe this conversation without losing the client?", kind: "help", up: 76, down: 5, hours: 10 },
    { space: "frontend-and-mobile", author: "devrim", title: "Next.js 16 proxy.ts migration notes — what broke for us", body: "Middleware → proxy rename, async `cookies()`/`params`, and the cache semantics that changed. Mostly painless, two gotchas around redirects in nested layouts.", kind: "discussion", up: 98, down: 7, hours: 100 },
    { space: "frontend-and-mobile", author: "priya.builds", title: "Showcase: design system that cut a 40-person team's PR review time by 35%", body: "Tokens → primitives → recipes. The trick was making the *wrong* thing hard to build. Storybook as the contract, visual regression in CI, and a lint rule that bans raw hex values.", kind: "showcase", up: 143, down: 3, hours: 300 },
    { space: "frontend-and-mobile", author: "lena_pm", title: "React Native vs Flutter for a B2B field app in 2026 — what would you actually pick?", body: "Offline-first, barcode scanning, 2 devs, 6 months. I keep getting religious answers.", kind: "discussion", up: 29, down: 4, hours: 3 },
    { space: "devops-cloud", author: "tomasz_ops", title: "We cut a Series B's AWS bill 41% in three weeks — the boring checklist", body: "No re-architecture. Right-sizing, Graviton, S3 lifecycle rules, killing idle NAT gateways, and a Savings Plan sized from actual p50 usage.\n\n- Idle NAT gateways: $2.1k/mo\n- Unattached EBS: $800/mo\n- Over-provisioned RDS: $6k/mo\n\nObservability side built with f/ines_ml.", kind: "showcase", up: 120, down: 4, hours: 20 },
    { space: "devops-cloud", author: "lena_pm", title: "How are you handling the Terraform licence change for client repos?", body: "Half my clients are on Terraform, half are asking about OpenTofu. Looking for a sane recommendation I can defend.", kind: "help", up: 18, down: 0, hours: 3 },
    { space: "devops-cloud", author: "mara_k", title: "Resource: on-call runbook template that survived 3 startups", body: "Severity matrix, escalation tree, comms templates, and the 'what to do in the first 5 minutes' card. Markdown, MIT licensed.\n\nhttps://github.com/mara-k/oncall-runbook", kind: "resource", up: 55, down: 3, hours: 200 },
    { space: "design-ux", author: "priya.builds", title: "Design-to-code handoff that doesn't rot: tokens as the single contract", body: "Figma variables → JSON → CSS custom properties → typed TS tokens. One source. The moment design and code share the *name* of a thing, handoff stops being a meeting.", kind: "resource", up: 92, down: 1, hours: 140 },
    { space: "design-ux", author: "lena_pm", title: "How do you price a usability study for an early-stage client?", body: "5 interviews, synthesis, a report. First time quoting research separately from design.", kind: "help", up: 23, down: 1, hours: 1 },
    { space: "security", author: "oluwaseun", title: "SOC 2 Type II in 5 months for a 12-person startup — realistic timeline & where the time goes", body: "Policies: 3 weeks. Evidence automation: 6 weeks. Observation window: 3 months. The rest is waiting on auditors.", kind: "resource", up: 47, down: 0, hours: 90 },
    { space: "data-and-ai", author: "ines_ml", title: "RAG vs fine-tuning: the decision matrix I give clients", body: "When retrieval is enough, when you fine-tune, and when you just need a better prompt and an eval set.\n\n| Signal | RAG | Fine-tune |\n|---|---|---|\n| Knowledge changes weekly | ✓ | ✗ |\n| Needs a specific *style* | ✗ | ✓ |\n\nEval harness details in b/software-engineering for the infra side.", kind: "resource", up: 158, down: 4, hours: 45 },
    { space: "data-and-ai", author: "lena_pm", title: "LLM feature silently returning stale answers for ~2% of users — how do I even debug this?", body: "No errors in logs. Vector index rebuilt nightly. Retention is 7 days on traces.", kind: "help", up: 29, down: 1, hours: 2 },
    { space: "data-and-ai", author: "tomasz_ops", title: "Running GPU inference on spot instances: 3 months in, honest review", body: "Saved ~60% on inference. Broke twice during capacity crunches. Worth it with a warm fallback pool.", kind: "showcase", up: 64, down: 2, hours: 160 },
    { space: "product-management", author: "lena_pm", title: "What does a technical PM actually do that a good engineer can't?", body: "Genuine question from someone moving into the role. Where is the PM judgement irreplaceable?", kind: "discussion", up: 67, down: 9, hours: 50 },
    { space: "rates-and-contracts", author: "priya.builds", title: "2026 day-rate survey results: tech freelancers by discipline (EU + US, n=412)", body: "Median EU: €720/day. Median US: $1,150/day. Security and AI/ML lead; design trails by ~18%. Verified Pros report 18% higher rates.\n\nRaw data on request. Discussion welcome from f/devrim and f/ines_ml who helped collect it.", kind: "resource", up: 201, down: 9, hours: 26 },
    { space: "rates-and-contracts", author: "ines_ml", title: "The 'kill fee' clause that saved me when a client ghosted mid-project", body: "30% of remaining scope, payable on 14 days of silence. Negotiated it in on every retainer since.", kind: "discussion", up: 88, down: 2, hours: 15 },
    { space: "software-engineering", author: "devrim", title: "Built an open-source API rate-limit simulator — feedback from backend folks wanted", body: "Models token bucket, sliding window, and GCRA against replayed traffic. https://github.com/devrim/ratelimit-sim", kind: "showcase", up: 73, down: 3, hours: 38 },
  ];

  const insertedPosts = await tx
    .insert(posts)
    .values(postSeeds.map((p) => ({ spaceId: s[p.space].id, authorId: u[p.author].id, slug: slugify(p.title), title: p.title, body: p.body, kind: p.kind, upvotes: p.up, downvotes: p.down, createdAt: ago(p.hours) })))
    .returning();

  const byTitle = (prefix: string) => insertedPosts.find((p) => p.title.startsWith(prefix));
  const latency = byTitle("Help: API p99");
  const stripe = byTitle("Client wants");
  const stale = byTitle("LLM feature silently");
  const migration = byTitle("Zero-downtime migration");
  const locking = byTitle("Postgres row-level");
  const rates = byTitle("2026 day-rate");

  if (latency && stripe && stale && migration && locking && rates) {
    const c1 = await tx
      .insert(comments)
      .values([
        { postId: latency.id, authorId: u.mara_k.id, body: "Weekly at a fixed time with pool saturation and flat CPU is almost always a **lock**, not load. Check `pg_stat_activity` for `wait_event` during the window — my bet is a weekly report query taking an `ACCESS EXCLUSIVE` via `REFRESH MATERIALIZED VIEW` without `CONCURRENTLY`.", upvotes: 31, downvotes: 0, isSolution: true, createdAt: ago(5) },
        { postId: latency.id, authorId: u.tomasz_ops.id, body: "That was exactly it. A BI job owned by nobody. Marking as solution.", upvotes: 9, downvotes: 0, createdAt: ago(4) },
        { postId: stripe.id, authorId: u.devrim.id, body: "Reframe it as risk: 'The two-day version charges cards. The two-week version keeps you compliant in the EU and recovers failed payments.' Then let them pick. Write both scopes down.", upvotes: 52, downvotes: 1, isSolution: true, createdAt: ago(9) },
        { postId: stripe.id, authorId: u.ines_ml.id, body: "Also: dunning is where the money is. Show them churn numbers.", upvotes: 18, downvotes: 0, createdAt: ago(8) },
        { postId: stripe.id, authorId: u.lena_pm.id, body: "As a client, the two-scope framing works on me every time.", upvotes: 7, downvotes: 0, createdAt: ago(7) },
        { postId: stale.id, authorId: u.ines_ml.id, body: "Check whether your embedding cache is keyed on the *query* but not the index version. After a nightly rebuild, cached neighbours point at old chunk IDs for anyone who asked the same question yesterday. Add the index build ID to the cache key.", upvotes: 22, downvotes: 0, isSolution: true, createdAt: ago(1.5) },
        { postId: migration.id, authorId: u.tomasz_ops.id, body: "Checksum verification step is the one everyone skips. Saved us twice.", upvotes: 14, downvotes: 0, createdAt: ago(28) },
        { postId: migration.id, authorId: u.oluwaseun.id, body: "Would you be open to turning this into a template? Could add the audit-logging angle for regulated clients.", upvotes: 11, downvotes: 0, createdAt: ago(27) },
        { postId: locking.id, authorId: u["priya.builds"].id, body: "The benchmarks are exactly what I needed for a client bidding system. One question — did you test with PgBouncer in transaction mode?", upvotes: 19, downvotes: 0, createdAt: ago(60) },
        { postId: rates.id, authorId: u.oluwaseun.id, body: "Would love the security cut broken down by pentest vs. compliance work next year.", upvotes: 8, downvotes: 0, createdAt: ago(20) },
      ])
      .returning();

    const nested = c1.find((c) => c.postId === locking.id);
    if (nested) {
      await tx.insert(comments).values({ postId: locking.id, authorId: u.mara_k.id, parentId: nested.id, body: "Yes — advisory locks break under transaction-mode pooling unless you keep them inside a single transaction. Added a note to the post.", upvotes: 12, downvotes: 0, createdAt: ago(58) });
    }
    for (const sol of c1.filter((c) => c.isSolution)) {
      await tx.update(posts).set({ isSolved: true, solutionCommentId: sol.id }).where(eq(posts.id, sol.postId));
    }
    for (const p of insertedPosts) {
      const [{ c: n }] = await tx.select({ c: count() }).from(comments).where(eq(comments.postId, p.id));
      await tx.update(posts).set({ commentCount: n }).where(eq(posts.id, p.id));
    }
  }

  type SeedLead = { author: string; space: string | null; title: string; description: string; category: string; kind: LeadKind; min: number; max: number; verified: boolean; escrow: boolean; hours: number; location: string };
  const leadSeeds: SeedLead[] = [
    { author: "mara_k", space: "software-engineering", title: "Build a usage-metering & billing service (Go or TypeScript, Postgres, Stripe)", description: "We meter ~40M events/day across 6 product surfaces. Need an idempotent ingestion path, hourly aggregation, and Stripe invoice sync. Existing data in Postgres + Kafka. Deliverable: deployed service + handover docs + load test report.\n\nMust have shipped billing or metering before. Mention a relevant project in your bid.", category: "Software Engineering", kind: "contract", min: 18000, max: 26000, verified: true, escrow: true, hours: 12, location: "Remote (EU hours)" },
    { author: "tomasz_ops", space: "devops-cloud", title: "Bounty: migrate 30 Terraform modules to OpenTofu with zero drift", description: "Modules cover VPC, EKS, RDS, IAM. Bounty paid on a clean `plan` with no diff across three environments plus a CI pipeline that enforces it.", category: "DevOps & Cloud", kind: "bounty", min: 4500, max: 4500, verified: true, escrow: true, hours: 30, location: "Remote" },
    { author: "devrim", space: "frontend-and-mobile", title: "Senior React Native engineer — fintech app rebuild (3 months, extendable)", description: "Expo, TypeScript, offline-first sync, biometric auth. You own the mobile surface end-to-end. Code review culture, async-first, 4-day weeks possible.", category: "Web & Mobile", kind: "job", min: 9000, max: 12000, verified: true, escrow: false, hours: 48, location: "Remote (UTC±3)" },
    { author: "oluwaseun", space: "security", title: "External penetration test + SOC 2 readiness gap assessment (SaaS, 25 engineers)", description: "Web app + API + AWS account review. Need a CREST/OSCP-level tester with report writing that a non-technical board can read. Retest included.", category: "Cybersecurity", kind: "contract", min: 7000, max: 9500, verified: false, escrow: false, hours: 72, location: "Remote" },
    { author: "ines_ml", space: "data-and-ai", title: "Production RAG system: eval harness, retrieval tuning, and cost reduction", description: "Existing LangChain prototype answers support tickets at 71% accuracy on our golden set. Target 90% with a p95 under 3s and cost under $0.02/query. Includes building the eval harness we keep.", category: "AI/ML", kind: "contract", min: 22000, max: 30000, verified: true, escrow: true, hours: 100, location: "Remote" },
    { author: "priya.builds", space: "design-ux", title: "Design system accessibility audit (WCAG 2.2 AA) — 60 components", description: "Audit, prioritised remediation list, and pairing with the in-house team for 2 weeks. Figma + React/Storybook.", category: "UI/UX Design", kind: "contract", min: 8000, max: 11000, verified: false, escrow: false, hours: 140, location: "Remote" },
    { author: "lena_pm", space: "product-management", title: "Fractional technical PM for a developer-tools startup (2 days/week, 6 months)", description: "Own discovery and roadmap for a CLI + web dashboard product. Must be comfortable reading PRs and writing SQL for your own analytics.", category: "Product", kind: "job", min: 6000, max: 8000, verified: false, escrow: false, hours: 200, location: "Remote (US hours)" },
    { author: "mara_k", space: "data-and-ai", title: "dbt + Snowflake data platform cleanup: 400 models, no tests, no owners", description: "Inherit, document, add tests, kill the dead models. Deliver an ownership map and CI that blocks untested models.", category: "Data Science", kind: "contract", min: 12000, max: 16000, verified: true, escrow: false, hours: 220, location: "Remote" },
    { author: "spamlord99", space: null, title: "Earn $5,000/week — guaranteed income, send a deposit to start", description: "No interview needed. Telegram me. Pay the processing fee and start today.", category: "Other", kind: "bounty", min: 5000, max: 5000, verified: false, escrow: false, hours: 50, location: "Anywhere" },
  ];
  const insertedLeads = await tx
    .insert(leads)
    .values(
      leadSeeds.map((l): typeof leads.$inferInsert => ({
        authorId: u[l.author].id,
        spaceId: l.space ? s[l.space].id : null,
        slug: slugify(l.title),
        title: l.title,
        description: l.description,
        category: l.category,
        kind: l.kind,
        budgetMin: l.min,
        budgetMax: l.max,
        location: l.location,
        publicationStatus: l.author !== "spamlord99" && (!l.space || s[l.space].privacy === "public") ? "published" : "pending_review",
        isVerified: l.verified,
        isEscrowed: l.escrow,
        upvotes: Math.floor(Math.random() * 30) + 2,
        downvotes: Math.floor(Math.random() * 3),
        createdAt: ago(l.hours),
      })),
    )
    .returning();

  const scamLead = insertedLeads.find((l) => l.authorId === u.spamlord99.id);
  const offtopic = byTitle("Is it reasonable");
  if (scamLead && offtopic) {
    await tx.insert(reports).values([
      { reporterId: u.devrim.id, targetType: "lead", targetId: scamLead.id, spaceId: null, reason: "misleading_bounty", details: "Classic upfront-deposit scam. Author already warned twice." },
      { reporterId: u.lena_pm.id, targetType: "lead", targetId: scamLead.id, spaceId: null, reason: "spam_scam", details: "Telegram-only contact, 'processing fee'." },
      { reporterId: u.tomasz_ops.id, targetType: "post", targetId: offtopic.id, spaceId: s["software-engineering"].id, reason: "off_topic", details: "Client question — belongs in b/rates-and-contracts?" },
    ]);
  }

  await tx
    .insert(votes)
    .values(insertedPosts.slice(0, 6).map((p) => ({ userId: u.lena_pm.id, targetType: "post" as const, targetId: p.id, value: 1 })))
    .onConflictDoNothing();

  for (const person of seededUsers) await evaluateBadges(person.id, tx);
}
