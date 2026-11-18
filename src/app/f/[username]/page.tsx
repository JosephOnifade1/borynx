import { and, count, eq } from "drizzle-orm";
import { ExternalLink, GitBranch, Globe } from "lucide-react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/db";
import { comments, follows, posts, spaces } from "@/db/schema";
import { FollowButton } from "@/components/FollowButton";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import { ProfileSignals } from "@/components/profile/ProfileSignals";
import { PostFeed } from "@/components/feed/PostFeed";
import { LeadFeed } from "@/components/leads/LeadFeed";
import { ProfileProjects } from "@/components/portfolio/ProfileProjects";
import { UserDiscipline } from "@/components/mod/ModActions";
import { PageFrame, Widget } from "@/components/PageFrame";
import { Avatar, BadgeChip, VerifiedMark } from "@/components/primitives";
import { getCurrentUser, isSiteStaff, isSuspended } from "@/lib/auth";
import { activePost, postSpaceAccess } from "@/lib/post-access";
import { toEditableProfile, toProfilePreferences } from "@/lib/profile-input";
import { countPublicProjects, listPublicProjects } from "@/lib/portfolio";
import { getPublicHiringCounts } from "@/lib/profile-leads";
import { listLeads, listPosts, resolveUser } from "@/lib/queries";
import { isRankMode } from "@/lib/sorting";
import { getUserBadges } from "@/lib/services";
import type { FeedLead, FeedPage, FeedPost } from "@/lib/types";
import { cn, routes, timeAgo } from "@/lib/utils";

type Params = Promise<{ username: string }>;
type Tab = "posts" | "solved" | "leads" | "projects";

const TAB_LABELS: Record<Tab, string> = { posts: "Threads", solved: "Solved", leads: "Leads", projects: "Projects" };

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
 *   identity, marketplace signals and a public activity feed, without separate account types
 * Legacy /u/… is rewritten by the proxy; renamed handles resolve through user_aliases.
 */
export default async function ProfilePage({ params, searchParams }: { params: Params; searchParams: Promise<{ tab?: string; sort?: string }> }) {
  const { username } = await params;
  const { tab: tabParam, sort } = await searchParams;
  const mode = isRankMode(sort) ? sort : "new";
  const resolved = await resolveUser(username);
  if (!resolved) notFound();
  if (!resolved.canonical) permanentRedirect(tabParam === "projects" ? routes.profileProjects(resolved.user.username) : routes.profile(resolved.user.username));
  const profile = resolved.user;
  const viewer = await getCurrentUser();
  const isSelf = viewer?.id === profile.id;
  const staff = viewer ? isSiteStaff(viewer) : false;

  const [badgeList, [threads], [solvedThreads], [solutions], hiring, [followers], isFollowingRow, projectItems, projectCount] = await Promise.all([
    getUserBadges(profile.id),
    db.select({ c: count() }).from(posts).innerJoin(spaces, eq(spaces.id, posts.spaceId)).where(and(eq(posts.authorId, profile.id), activePost, postSpaceAccess(viewer))),
    db.select({ c: count() }).from(posts).innerJoin(spaces, eq(spaces.id, posts.spaceId)).where(and(eq(posts.authorId, profile.id), activePost, postSpaceAccess(viewer), eq(posts.isSolved, true))),
    db.select({ c: count() }).from(comments).innerJoin(posts, eq(posts.id, comments.postId)).innerJoin(spaces, eq(spaces.id, posts.spaceId))
      .where(and(eq(comments.authorId, profile.id), eq(comments.isSolution, true), eq(comments.isRemoved, false), activePost, postSpaceAccess(viewer))),
    getPublicHiringCounts(profile.id),
    db.select({ c: count() }).from(follows).where(eq(follows.followingId, profile.id)),
    viewer
      ? db
          .select({ followerId: follows.followerId })
          .from(follows)
          .where(and(eq(follows.followerId, viewer.id), eq(follows.followingId, profile.id)))
          .limit(1)
      : Promise.resolve([]),
    tabParam === "projects" ? listPublicProjects(profile.id) : null,
    tabParam === "projects" ? null : countPublicProjects(profile.id),
  ]);

  const hiringFocus = !profile.availableForWork && (profile.lookingToHire || hiring.accepting > 0);
  const tabs: Tab[] = hiringFocus ? ["leads", "posts", "solved", "projects"] : ["posts", "projects", "solved", "leads"];
  const tab: Tab = tabParam === "posts" || tabParam === "solved" || tabParam === "leads" || tabParam === "projects" ? tabParam : tabs[0];
  const counts: Record<Tab, number> = { posts: threads.c, solved: solvedThreads.c, leads: hiring.published, projects: projectItems?.length ?? projectCount ?? 0 };
  const leadPage: FeedPage<FeedLead> | null = tab === "leads" ? await listLeads({ mode: "new", authorId: profile.id, viewerId: viewer?.id ?? null }) : null;
  const postPage: FeedPage<FeedPost> | null = tab === "posts" || tab === "solved" ? await listPosts({ mode, authorId: profile.id, solvedOnly: tab === "solved", viewer }) : null;
  const hue = profile.avatarHue;
  const base = routes.profile(profile.username);
  const profileStats: [string, number][] = hiringFocus
    ? [["followers", followers.c], ["threads", threads.c]]
    : [["karma", profile.karma], ["followers", followers.c], ["threads", threads.c], ["solutions", solutions.c]];

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
              <dl className="num flex flex-wrap gap-4 pb-1 text-center">
                {profileStats.map(([label, value]) => (
                  <div key={label}>
                    <dd className="text-[18px] font-semibold">{value.toLocaleString("en-US")}</dd>
                    <dt className="eyebrow">{label}</dt>
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
                <EditProfileModal user={toEditableProfile(profile)} />
              )}
            </div>
            {profile.headline && <p className="mt-1.5 text-[14px] text-ink-2">{profile.headline}</p>}
            {profile.isBanned && <p className="tag tag-danger mt-2">Restricted</p>}
            <ProfileSignals preferences={toProfilePreferences(profile)} hiring={hiring} />

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
      <nav aria-label="Profile activity" className="panel mb-3 flex flex-wrap items-center gap-x-1 rounded-lg px-2">
        {tabs.map((id) => {
          const active = tab === id;
          return (
            <Link
              key={id}
              href={id === "posts" && !hiringFocus ? base : `${base}?tab=${id}`}
              aria-current={active ? "page" : undefined}
              className={cn("relative flex h-10 items-center gap-1.5 px-2 text-[13px] font-semibold transition-colors sm:px-3", active ? "text-ink" : "text-ink-3 hover:text-ink")}
            >
              {TAB_LABELS[id]}
              <span className="num text-[11px] font-normal text-ink-3">{counts[id]}</span>
              {active && <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-ember" />}
            </Link>
          );
        })}
      </nav>

      {projectItems ? (
        <ProfileProjects projects={projectItems} owner={isSelf} canModerate={Boolean(viewer && staff && !isSelf && !isSuspended(viewer))} />
      ) : leadPage ? (
        <LeadFeed author={profile.username} initialPage={leadPage} />
      ) : (
        postPage && (
          <PostFeed
            author={profile.username}
            solved={tab === "solved"}
            initialMode={mode}
            initialPage={postPage}
            emptyTitle={tab === "solved" ? "No solved threads yet" : "No threads yet"}
            emptyHint={isSelf ? "Your first thread unlocks the First Post badge." : "Nothing published yet."}
          />
        )
      )}
    </PageFrame>
  );
}
