import { and, eq } from "drizzle-orm";
import { Lock, PenLine, Shield } from "lucide-react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { PostFeed } from "@/components/feed/PostFeed";
import { JoinButton } from "@/components/forms";
import { PageFrame, PageHeader, Widget } from "@/components/PageFrame";
import { Avatar, VerifiedMark } from "@/components/primitives";
import { canModerateSpace, getCurrentUser } from "@/lib/auth";
import { listPosts, resolveSpace } from "@/lib/queries";
import { isRankMode, type RankMode } from "@/lib/sorting";
import { routes } from "@/lib/utils";

export default async function SpacePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sort?: string }> }) {
  const { slug } = await params;
  const { sort } = await searchParams;
  const mode: RankMode = isRankMode(sort) ? sort : "hot";
  const resolved = await resolveSpace(slug);
  if (!resolved) notFound();
  if (!resolved.canonical) permanentRedirect(routes.space(resolved.space.slug));
  const space = resolved.space;
  const user = await getCurrentUser();

  const [mods, membership, canMod, initialPage] = await Promise.all([
    db
      .select({ username: users.username, displayName: users.displayName, avatarHue: users.avatarHue, isVerified: users.isVerified, modRole: memberships.modRole })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.spaceId, space.id), eq(memberships.modRole, "moderator")))
      .union(
        db
          .select({ username: users.username, displayName: users.displayName, avatarHue: users.avatarHue, isVerified: users.isVerified, modRole: memberships.modRole })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(and(eq(memberships.spaceId, space.id), eq(memberships.modRole, "owner"))),
      ),
    user ? db.select().from(memberships).where(and(eq(memberships.userId, user.id), eq(memberships.spaceId, space.id))).limit(1) : Promise.resolve([]),
    user ? canModerateSpace(user, space.id) : Promise.resolve(false),
    listPosts({ mode, spaceId: space.id, viewer: user }),
  ]);
  const joined = membership.length > 0;
  const isOwner = membership[0]?.modRole === "owner";
  const canPost = user && !user.isBanned && (space.privacy === "public" || joined || user.role !== "member");

  return (
    <PageFrame
      stream
      header={
        <PageHeader
          accentHue={space.accentHue}
          eyebrow={
            <>
              Space · {space.privacy}
              {space.privacy !== "public" && <Lock size={10} className="ml-1 inline" />}
            </>
          }
          title={
            <>
              <span className="text-ink-3">b/</span>
              {space.slug}
            </>
          }
          description={
            <>
              <p className="font-medium text-ink">{space.name}</p>
              <p>{space.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {space.topics.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            </>
          }
          actions={
            <>
              {canMod && (
                <Link href={routes.spaceMod(space.slug)} className="btn">
                  <Shield size={13} /> Mod tools
                </Link>
              )}
              {canPost && (
                <Link href={routes.spaceSubmit(space.slug)} className="btn">
                  <PenLine size={13} /> New thread
                </Link>
              )}
              <JoinButton slug={space.slug} joined={joined} privacy={space.privacy} isOwner={isOwner} />
            </>
          }
        />
      }
      aside={
        <>
          <Widget title="About">
            <dl className="num grid grid-cols-2 gap-2 text-[12px]">
              <div className="rounded bg-sunken p-2">
                <dt className="eyebrow">Members</dt>
                <dd className="text-[16px] font-semibold">{space.memberCount}</dd>
              </div>
              <div className="rounded bg-sunken p-2">
                <dt className="eyebrow">Since</dt>
                <dd className="text-[16px] font-semibold">{space.createdAt.getFullYear()}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[12.5px] text-ink-2">{space.tagline}</p>
          </Widget>
          {space.rules.length > 0 && (
            <Widget title="Rules">
              <ol className="space-y-2 text-[12.5px] text-ink-2">
                {space.rules.map((r, i) => (
                  <li key={r} className="flex gap-2">
                    <span className="num text-ink-4">{String(i + 1).padStart(2, "0")}</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ol>
            </Widget>
          )}
          <Widget title="Moderators">
            <ul className="space-y-1.5">
              {mods.map((m) => (
                <li key={m.username}>
                  <Link href={routes.profile(m.username)} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-sunken">
                    <Avatar hue={m.avatarHue} name={m.displayName} size={22} />
                    <span className="num text-[12.5px]">f/{m.username}</span>
                    {m.isVerified && <VerifiedMark size={11} />}
                    <span className="num ml-auto text-[10px] uppercase tracking-wider text-gold">{m.modRole}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Widget>
        </>
      }
    >
      <PostFeed composer space={space.slug} showSpace={false} initialMode={mode} initialPage={initialPage} emptyTitle={`b/${space.slug} is quiet`} emptyHint="Start the first thread and set the tone." />
    </PageFrame>
  );
}
