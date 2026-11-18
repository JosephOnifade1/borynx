import { and, count, desc, eq, gte } from "drizzle-orm";
import { Lock, Plus } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { memberships, posts, spaces } from "@/db/schema";
import { PageFrame, PageHeader } from "@/components/PageFrame";
import { getCurrentUser } from "@/lib/auth";
import { activePost } from "@/lib/post-access";
import { routes } from "@/lib/utils";

export const metadata = { title: "Spaces" };

export default async function SpacesDirectory() {
  const user = await getCurrentUser();
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [all, weekly, mine] = await Promise.all([
    db.select().from(spaces).orderBy(desc(spaces.memberCount)),
    db.select({ spaceId: posts.spaceId, c: count() }).from(posts).where(and(activePost, gte(posts.createdAt, since))).groupBy(posts.spaceId),
    user ? db.select({ spaceId: memberships.spaceId }).from(memberships).where(eq(memberships.userId, user.id)) : Promise.resolve([]),
  ]);
  const weeklyMap = new Map(weekly.map((w) => [w.spaceId, w.c]));
  const mineSet = new Set(mine.map((m) => m.spaceId));

  return (
    <PageFrame
      wide
      header={
        <PageHeader
          eyebrow="Directory"
          title="Niche spaces"
          description="Each space is a working room for one vertical. Canonical path: /b/:slug — legacy /r, /c and /community links resolve here automatically."
          actions={
            <Link href={routes.spaceNew()} className="btn btn-primary">
              <Plus size={14} /> Create a space
            </Link>
          }
        />
      }
    >
      <ul className="grid gap-px bg-line sm:grid-cols-2">
        {all.map((s, i) => (
          <li key={s.id} className="bg-surface">
            <Link href={routes.space(s.slug)} className="group block h-full p-5 transition-colors hover:bg-raised">
              <div className="flex items-start justify-between gap-3">
                <span className="num text-[10.5px] text-ink-4">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex items-center gap-1.5">
                  {s.privacy !== "public" && (
                    <span className="tag">
                      <Lock size={9} /> {s.privacy}
                    </span>
                  )}
                  {mineSet.has(s.id) && <span className="tag tag-verdigris">joined</span>}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="h-9 w-9 shrink-0 rounded-md" style={{ background: `linear-gradient(135deg, hsl(${s.accentHue} 65% 50%), hsl(${(s.accentHue + 30) % 360} 60% 35%))` }} />
                <div className="min-w-0">
                  <h2 className="num text-[15px] font-semibold group-hover:underline">b/{s.slug}</h2>
                  <p className="truncate text-[12.5px] text-ink-3">{s.name}</p>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-[13px] text-ink-2">{s.tagline}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {s.topics.slice(0, 4).map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
              <dl className="num mt-4 flex gap-5 text-[11px] text-ink-3">
                <div>
                  <dt className="inline">members </dt>
                  <dd className="inline text-ink">{s.memberCount}</dd>
                </div>
                <div>
                  <dt className="inline">threads / 7d </dt>
                  <dd className="inline text-ink">{weeklyMap.get(s.id) ?? 0}</dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </PageFrame>
  );
}
