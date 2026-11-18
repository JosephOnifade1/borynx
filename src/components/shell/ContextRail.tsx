import { and, desc, eq, gte, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { comments, leads, posts, spaces, users } from "@/db/schema";
import { PLATFORM_RULES } from "@/lib/constants";
import { activePost } from "@/lib/post-access";
import { formatBudget, routes } from "@/lib/utils";
import { Avatar, VerifiedMark } from "../primitives";
import { Widget } from "../Widget";

/**
 * Sticky right column shared by every feed page. Four live widgets, all queried server-side:
 * trending communities (7-day thread volume), top open bounties by budget, verified solvers
 * (accepted solutions), and platform rules.
 */
export async function ContextRail() {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [trending, topLeads, solvers] = await Promise.all([
    db
      .select({
        slug: spaces.slug,
        name: spaces.name,
        accentHue: spaces.accentHue,
        weekly: sql<number>`count(${posts.id})::int`,
      })
      .from(spaces)
      .leftJoin(posts, and(eq(posts.spaceId, spaces.id), activePost, gte(posts.createdAt, since)))
      .where(eq(spaces.privacy, "public"))
      .groupBy(spaces.id)
      .orderBy(desc(sql`count(${posts.id})`), desc(spaces.memberCount))
      .limit(5),
    db
      .select({ id: leads.id, slug: leads.slug, title: leads.title, kind: leads.kind, budgetMin: leads.budgetMin, budgetMax: leads.budgetMax, currency: leads.currency, isVerified: leads.isVerified })
      .from(leads)
      .where(and(eq(leads.isRemoved, false), eq(leads.status, "open")))
      .orderBy(desc(leads.budgetMax))
      .limit(4),
    db
      .select({
        username: users.username,
        displayName: users.displayName,
        avatarHue: users.avatarHue,
        karma: users.karma,
        solved: sql<number>`count(${comments.id})::int`,
      })
      .from(users)
      .leftJoin(comments, and(eq(comments.authorId, users.id), eq(comments.isSolution, true)))
      .where(and(eq(users.isVerified, true), eq(users.isBanned, false)))
      .groupBy(users.id)
      .orderBy(desc(sql`count(${comments.id})`), desc(users.karma))
      .limit(4),
  ]);

  return (
    <>
      <Widget title="Trending communities" action={<Link href={routes.spaces()} className="text-[11.5px] text-ember hover:underline">all →</Link>}>
        <ol className="space-y-2">
          {trending.map((s, i) => (
            <li key={s.slug}>
              <Link href={routes.space(s.slug)} className="flex items-center gap-2.5 rounded px-1 py-1 hover:bg-sunken">
                <span className="num w-3 text-[11px] text-ink-4">{i + 1}</span>
                <span className="h-6 w-6 shrink-0 rounded-[5px]" style={{ background: `hsl(${s.accentHue} 60% 48%)` }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="num block truncate text-[12.5px] font-medium">b/{s.slug}</span>
                  <span className="block truncate text-[11px] text-ink-3">{s.name}</span>
                </span>
                <span className="num text-[11px] text-ink-3">{s.weekly}/7d</span>
              </Link>
            </li>
          ))}
        </ol>
      </Widget>

      <Widget title="Top bounties & leads" action={<Link href={routes.leads()} className="text-[11.5px] text-ember hover:underline">all →</Link>}>
        {topLeads.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">No open leads right now.</p>
        ) : (
          <ul className="space-y-2.5">
            {topLeads.map((l) => (
              <li key={l.id}>
                <Link href={routes.lead(l.id, l.slug)} className="group block">
                  <span className="line-clamp-2 text-[13px] font-medium leading-snug group-hover:underline">{l.title}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px]">
                    <span className="num tag tag-verdigris">{formatBudget(l.budgetMin, l.budgetMax, l.currency)}</span>
                    <span className="tag">{l.kind === "bounty" ? "Bounty" : l.kind === "job" ? "Role" : "Contract"}</span>
                    {l.isVerified && <VerifiedMark size={11} />}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Widget>

      <Widget title="Verified solvers">
        <ul className="space-y-2">
          {solvers.map((s) => (
            <li key={s.username}>
              <Link href={routes.profile(s.username)} className="flex items-center gap-2.5 rounded px-1 py-0.5 hover:bg-sunken">
                <Avatar hue={s.avatarHue} name={s.displayName} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-[12.5px] font-medium">
                    <span className="truncate">{s.displayName}</span>
                    <VerifiedMark size={11} />
                  </span>
                  <span className="num block truncate text-[11px] text-ink-3">f/{s.username}</span>
                </span>
                <span className="num text-right text-[11px] text-ink-3">
                  <span className="block font-semibold text-ink">{s.solved}</span>solved
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Widget>

      <Widget title="Platform rules">
        <ol className="space-y-2 text-[12.5px] text-ink-2">
          {PLATFORM_RULES.map((r, i) => (
            <li key={r} className="flex gap-2">
              <span className="num text-ink-4">{String(i + 1).padStart(2, "0")}</span>
              <span>{r}</span>
            </li>
          ))}
        </ol>
      </Widget>
    </>
  );
}
