import { and, count, eq } from "drizzle-orm";
import { ExternalLink, GitBranch, Globe } from "lucide-react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/db";
import { comments, follows, leads, posts } from "@/db/schema";
import { FollowButton } from "@/components/FollowButton";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import { PostFeed } from "@/components/feed/PostFeed";
import { LeadFeed } from "@/components/leads/LeadFeed";
import { UserDiscipline } from "@/components/mod/ModActions";
import { PageFrame, Widget } from "@/components/PageFrame";
import { Avatar, BadgeChip, VerifiedMark } from "@/components/primitives";
import { getCurrentUser, isSiteStaff } from "@/lib/auth";
import { listLeads, listPosts, resolveUser } from "@/lib/queries";
import { getUserBadges } from "@/lib/services";
import type { FeedLead, FeedPage, FeedPost } from "@/lib/types";
import { cn, routes, timeAgo } from "@/lib/utils";

type Params = Promise<{ username: string }>;
type Tab = "posts" | "solved" | "leads";

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "posts", label: "Threads" },
  { id: "solved", label: "Solved" },
  { id: "leads", label: "Active leads" },
];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  try {
    const { username } = await params;
    const r = await resolveUser(username);
    return { title: r ? `${r.user.displayName} (f/${r.user.username})` : "Profile" };
  } catch {
    return { title: "Profile" };
  }
}

/**
 * Canonical profile: /f/:username. Layout, top to bottom:
 *   banner · avatar · name · headline · skills · achievement shelf · stats
 *   tab bar (Threads · Solved · Active leads) · tabbed feed
 * Legacy /u/… is rewritten by the proxy; renamed handles resolve through user_aliases.
 */
export default async function ProfilePage({ params, searchParams }: { params: Params; searchParams: Promise<{ tab?: string }> }) {
  const { username } = await params;
  const { tab: tabParam } = await searchParams;
  const resolved = await resolveUser(username);
  if (!resolved) notFound();
  if (!resolved.canonical) permanentRedirect(routes.profile(resolved.user.username));
  const profile = resolved.user;
  const tab: Tab = tabParam === "solved" || tabParam === "leads" ? tabParam : "posts";
  const viewer = await getCurrentUser();
  const isSelf = viewer?.id === profile.id;
  const staff = viewer ? isSiteStaff(viewer) : false;

  const [badgeList, [threads], [solvedThreads], [solutions], [openLeads], [followers], isFollowingRow] = await Promise.all([
    getUserBadges(profile.id),
    db.select({ c: count() }).from(posts).where(and(eq(posts.authorId, profile.id), eq(posts.isRemoved, false))),
    db.select({ c: count() }).from(posts).where(and(eq(posts.authorId, profile.id), eq(posts.isRemoved, false), eq(posts.isSolved, true))),
    db.select({ c: count() }).from(comments).where(and(eq(comments.authorId, profile.id), eq(comments.isSolution, true))),
    db.select({ c: count() }).from(leads).where(and(eq(leads.authorId, profile.id), eq(leads.isRemoved, false), eq(leads.status, "open"))),
    db.select({ c: count() }).from(follows).where(eq(follows.followingId, profile.id)),
    viewer
      ? db
          .select({ followerId: follows.followerId })
          .from(follows)
          .where(and(eq(follows.followerId, viewer.id), eq(follows.followingId, profile.id)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const counts: Record<Tab, number> = { posts: threads.c, solved: solvedThreads.c, leads: openLeads.c };
  const leadPage: FeedPage<FeedLead> | null = tab === "leads" ? await listLeads({ mode: "new", authorId: profile.id, viewerId: viewer?.id ?? null }) : null;
  const postPage: FeedPage<FeedPost> | null = tab !== "leads" ? await listPosts({ mode: "new", authorId: profile.id, solvedOnly: tab === "solved", viewerId: viewer?.id ?? null }) : null;
  const hue = profile.avatarHue;
  const base = routes.profile(profile.username);

  return (
    <PageFrame
      stream
      aside={
        <Widget title="About">
          <p className="text-[13px] leading-relaxed text-ink-2">{profile.bio || "No bio yet."}</p>
          <ul className="mt-3 space-y-1.5 text-[12.5px]">
            {profile.githubUrl && (
              <li>
                <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-verdigris hover:underline">
                  <GitBranch size={12} /> {profile.githubUrl.replace("https://", "")} <ExternalLink size={10} />
                </a>
              </li>
            )}
            {profile.portfolioUrl && (
              <li>
                <a href={profile.portfolioUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-verdigris hover:underline">
                  <Globe size={12} /> {profile.portfolioUrl.replace(/^https?:\/\//, "")} <ExternalLink size={10} />
                </a>
              </li>
            )}
            <li className="num text-ink-3">joined {timeAgo(profile.createdAt)} ago</li>
          </ul>
          {isSelf && (
            <Link href={routes.achievements()} className="btn btn-sm mt-4 w-full justify-center">
              View achievement progress
            </Link>
          )}
        </Widget>
      }
      header={
        <section className="panel overflow-hidden rounded-lg">
          <div aria-hidden="true" className="h-24 w-full" style={{ background: `linear-gradient(120deg, hsl(${hue} 55% 40%), hsl(${(hue + 60) % 360} 60% 20%))` }} />
          <div className="px-5 pb-5">
            <div className="-mt-9 flex flex-wrap items-end justify-between gap-4">
              <Avatar hue={hue} name={profile.displayName} size={72} className="rounded-lg text-[26px]" />
              <dl className="num flex gap-5 pb-1 text-center">
                {(
                  [
                    ["karma", profile.karma.toLocaleString("en-US")],
                    ["followers", followers.c.toLocaleString("en-US")],
                    ["threads", String(threads.c)],
                    ["solutions", String(solutions.c)],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dd className="text-[18px] font-semibold">{v}</dd>
                    <dt className="eyebrow">{k}</dt>
                  </div>
                ))}
              </dl>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="display flex items-center gap-2 text-[26px]">
                  {profile.displayName}
                  {profile.isVerified && <VerifiedMark size={18} />}
                </h1>
                <p className="num text-[12px] text-ink-3">
                  f/{profile.username}
                  {profile.role !== "member" && <span className="tag tag-gold ml-2 normal-case tracking-normal">{profile.role}</span>}
                </p>
              </div>
              {!isSelf ? (
                <FollowButton
                  username={profile.username}
                  initialFollowing={isFollowingRow.length > 0}
                  initialFollowerCount={followers.c}
                  size="md"
                />
              ) : (
                <EditProfileModal user={profile} />
              )}
            </div>
            {profile.headline && <p className="mt-1.5 text-[14px] text-ink-2">{profile.headline}</p>}
            {profile.isBanned && <p className="tag tag-danger mt-2">restricted · {profile.banReason}</p>}

            {profile.skills.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {profile.skills.map((s) => (
                  <span key={s} className="tag">
                    {s}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4">
              <p className="eyebrow mb-2">Achievement shelf</p>
              {badgeList.length === 0 ? (
                <p className="text-[12.5px] text-ink-3">No badges yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {badgeList.map((b) => (
                    <BadgeChip key={b.slug} icon={b.icon} name={b.name} tier={b.tier} />
                  ))}
                </div>
              )}
            </div>

            {staff && !isSelf && (
              <div className="mt-4 rounded-md border border-dashed border-gold/60 bg-gold-soft/30 p-3">
                <p className="eyebrow mb-2 text-gold">Staff actions</p>
                <UserDiscipline userId={profile.id} isBanned={profile.isBanned} isVerified={profile.isVerified} />
              </div>
            )}
          </div>
        </section>
      }
    >
      <nav aria-label="Profile activity" className="panel mb-3 flex items-center gap-1 rounded-lg px-2">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <Link
              key={t.id}
              href={t.id === "posts" ? base : `${base}?tab=${t.id}`}
              aria-current={active ? "page" : undefined}
              className={cn("relative flex h-10 items-center gap-1.5 px-3 text-[13px] font-semibold transition-colors", active ? "text-ink" : "text-ink-3 hover:text-ink")}
            >
              {t.label}
              <span className="num text-[11px] font-normal text-ink-3">{counts[t.id]}</span>
              {active && <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-ember" />}
            </Link>
          );
        })}
      </nav>

      {leadPage ? (
        <LeadFeed author={profile.username} initialPage={leadPage} />
      ) : (
        postPage && (
          <PostFeed
            author={profile.username}
            solved={tab === "solved"}
            initialMode="new"
            initialPage={postPage}
            emptyTitle={tab === "solved" ? "No solved threads yet" : "No threads yet"}
            emptyHint={isSelf ? "Your first thread unlocks the First Post badge." : "Nothing published yet."}
          />
        )
      )}
    </PageFrame>
  );
}
