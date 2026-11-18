import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { db } from "@/db";
import { comments, memberships, posts, reports, users } from "@/db/schema";
import { ModeratorManager, ReportDecision } from "@/components/mod/ModActions";
import { ReportedPostEvidence } from "@/components/mod/ReportedPostEvidence";
import { PageFrame, PageHeader, Widget } from "@/components/PageFrame";
import { canModerateSpace, getCurrentUser } from "@/lib/auth";
import { REPORT_REASON_LABEL } from "@/lib/constants";
import { resolveSpace } from "@/lib/queries";
import { routes, timeAgo } from "@/lib/utils";

export default async function SpaceModPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resolved = await resolveSpace(slug);
  if (!resolved) notFound();
  if (!resolved.canonical) permanentRedirect(routes.spaceMod(resolved.space.slug));
  const space = resolved.space;
  const user = await getCurrentUser();
  if (!user) redirect(`${routes.login()}?next=${encodeURIComponent(routes.spaceMod(space.slug))}`);
  if (!(await canModerateSpace(user, space.id))) redirect(routes.space(space.slug));

  const [pending, mods, recentlyRemoved] = await Promise.all([
    db.select().from(reports).where(and(eq(reports.spaceId, space.id), eq(reports.status, "pending"))).orderBy(desc(reports.createdAt)).limit(50),
    db
      .select({ username: users.username, modRole: memberships.modRole })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.spaceId, space.id), isNotNull(memberships.modRole))),
    db.select({ id: posts.id, title: posts.title }).from(posts).where(and(eq(posts.spaceId, space.id), eq(posts.isRemoved, true))).orderBy(desc(posts.createdAt)).limit(8),
  ]);

  const postIds = pending.filter((r) => r.targetType === "post").map((r) => r.targetId);
  const commentIds = pending.filter((r) => r.targetType === "comment").map((r) => r.targetId);
  const [postRows, commentRows] = await Promise.all([
    postIds.length ? db.select({ id: posts.id, title: posts.title, slug: posts.slug, isRemoved: posts.isRemoved }).from(posts).where(inArray(posts.id, postIds)) : Promise.resolve([]),
    commentIds.length ? db.select({ id: comments.id, body: comments.body, postId: comments.postId, isRemoved: comments.isRemoved }).from(comments).where(inArray(comments.id, commentIds)) : Promise.resolve([]),
  ]);
  const postMap = new Map(postRows.map((p) => [p.id, p]));
  const commentMap = new Map(commentRows.map((c) => [c.id, c]));

  return (
    <PageFrame wide
      header={<PageHeader accentHue={space.accentHue} eyebrow={`Moderation · b/${space.slug}`} title="Space mod tools" description="Space-scoped reports, moderator roster, and recent removals. Site-wide cases live in /mod/queue." actions={<Link href={routes.modQueue()} className="btn">Global queue →</Link>} />}
      aside={
        <>
          <Widget title={`Moderators · ${mods.length}`}>
            <ModeratorManager slug={space.slug} moderators={mods.map((m) => ({ username: m.username, modRole: m.modRole }))} />
          </Widget>
          <Widget title="Recently removed">
            {recentlyRemoved.length === 0 ? <p className="text-[12.5px] text-ink-3">Nothing removed yet.</p> : <ul className="space-y-1.5 text-[12.5px] text-ink-2">{recentlyRemoved.map((p) => <li key={p.id} className="line-clamp-1 line-through">{p.title}</li>)}</ul>}
          </Widget>
        </>
      }
    >
      <div className="hairline-b flex items-center justify-between px-4 py-3">
        <h2 className="display text-[16px]">
          Pending reports <span className="num text-ink-3">{pending.length}</span>
        </h2>
      </div>
      {pending.length === 0 && (
        <div className="px-6 py-14 text-center">
          <p className="display text-[16px]">Queue is clear</p>
          <p className="mt-1 text-[13px] text-ink-3">No open reports in this space.</p>
        </div>
      )}
      <ul>
        {pending.map((r) => {
          const post = r.targetType === "post" ? postMap.get(r.targetId) : undefined;
          const comment = r.targetType === "comment" ? commentMap.get(r.targetId) : undefined;
          return (
            <li key={r.id} className="ledger-row px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
                <span className="tag tag-ember">{REPORT_REASON_LABEL[r.reason]}</span>
                <span className="tag">{r.targetType}</span>
                <span className="num">#{r.id}</span>
                <span className="num">{timeAgo(r.createdAt)}</span>
              </div>
              <p className="mt-1.5 text-[14px] font-medium">
                {post ? (
                  <Link href={routes.post(space.slug, post.id, post.slug)} className="hover:underline">
                    {post.title}
                  </Link>
                ) : comment ? (
                  <Link href={`${routes.postShort(comment.postId)}#c-${comment.id}`} className="line-clamp-2 hover:underline">
                    “{comment.body}”
                  </Link>
                ) : (
                  <span className="text-ink-3">Target no longer exists</span>
                )}
              </p>
              {r.details && <p className="mt-1 text-[12.5px] text-ink-2">{r.details}</p>}
              {r.targetType === "post" && <ReportedPostEvidence snapshot={r.postSnapshot} />}
              <div className="mt-2.5">
                <ReportDecision reportId={r.id} />
              </div>
            </li>
          );
        })}
      </ul>
    </PageFrame>
  );
}
