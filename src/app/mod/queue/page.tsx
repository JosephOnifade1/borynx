import { and, count, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { comments, leads, modActions, posts, reports, spaces, users } from "@/db/schema";
import { ReportDecision, UserDiscipline } from "@/components/mod/ModActions";
import { PageFrame, PageHeader, Widget } from "@/components/PageFrame";
import { Avatar } from "@/components/primitives";
import { getCurrentUser, isSiteStaff } from "@/lib/auth";
import { REPORT_REASON_LABEL } from "@/lib/constants";
import { routes, timeAgo } from "@/lib/utils";

export const metadata = { title: "Moderation queue" };

export default async function ModQueuePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(`${routes.login()}?next=${routes.modQueue()}`);
  if (!isSiteStaff(user)) redirect("/");
  const { status: statusParam } = await searchParams;
  const status = statusParam === "approved" || statusParam === "dismissed" ? statusParam : "pending";

  const [rows, counts, restricted, recentActions] = await Promise.all([
    db
      .select({ report: reports, reporter: { username: users.username }, space: { slug: spaces.slug } })
      .from(reports)
      .leftJoin(users, eq(users.id, reports.reporterId))
      .leftJoin(spaces, eq(spaces.id, reports.spaceId))
      .where(eq(reports.status, status))
      .orderBy(desc(reports.createdAt))
      .limit(100),
    db.select({ status: reports.status, c: count() }).from(reports).groupBy(reports.status),
    db.select({ id: users.id, username: users.username, displayName: users.displayName, avatarHue: users.avatarHue, banReason: users.banReason, banExpiresAt: users.banExpiresAt, isVerified: users.isVerified }).from(users).where(eq(users.isBanned, true)).limit(10),
    db.select({ action: modActions.action, reason: modActions.reason, createdAt: modActions.createdAt, moderator: users.username }).from(modActions).leftJoin(users, eq(users.id, modActions.moderatorId)).orderBy(desc(modActions.createdAt)).limit(8),
  ]);

  const ids = (t: "post" | "comment" | "lead") => rows.filter((r) => r.report.targetType === t).map((r) => r.report.targetId);
  const [postRows, commentRows, leadRows] = await Promise.all([
    ids("post").length ? db.select({ id: posts.id, title: posts.title, slug: posts.slug, authorId: posts.authorId, isRemoved: posts.isRemoved, spaceSlug: spaces.slug }).from(posts).innerJoin(spaces, eq(spaces.id, posts.spaceId)).where(inArray(posts.id, ids("post"))) : Promise.resolve([]),
    ids("comment").length ? db.select({ id: comments.id, body: comments.body, postId: comments.postId, authorId: comments.authorId, isRemoved: comments.isRemoved }).from(comments).where(inArray(comments.id, ids("comment"))) : Promise.resolve([]),
    ids("lead").length ? db.select({ id: leads.id, title: leads.title, slug: leads.slug, authorId: leads.authorId, isRemoved: leads.isRemoved }).from(leads).where(inArray(leads.id, ids("lead"))) : Promise.resolve([]),
  ]);
  const authorIds = [...new Set([...postRows, ...commentRows, ...leadRows].map((r) => r.authorId))];
  const authors = authorIds.length ? await db.select({ id: users.id, username: users.username, isBanned: users.isBanned, isVerified: users.isVerified, warningCount: users.warningCount }).from(users).where(inArray(users.id, authorIds)) : [];
  const authorMap = new Map(authors.map((a) => [a.id, a]));
  const postMap = new Map(postRows.map((p) => [p.id, p]));
  const commentMap = new Map(commentRows.map((c) => [c.id, c]));
  const leadMap = new Map(leadRows.map((l) => [l.id, l]));
  const countMap = new Map(counts.map((c) => [c.status, c.c]));

  return (
    <PageFrame wide
      header={<PageHeader eyebrow="Moderation · site-wide" title="Moderation queue" description="Approve a report to remove the content and resolve all sibling reports on the same target. Dismiss to keep it. Discipline actions are logged to mod_actions." />}
      aside={
        <>
          <Widget title="Restricted accounts">
            {restricted.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">Nobody is restricted.</p>
            ) : (
              <ul className="space-y-3">
                {restricted.map((r) => (
                  <li key={r.id}>
                    <div className="flex items-center gap-2">
                      <Avatar hue={r.avatarHue} name={r.displayName} size={22} />
                      <Link href={routes.profile(r.username)} className="num text-[12.5px] font-medium hover:underline">
                        f/{r.username}
                      </Link>
                      <span className="num ml-auto text-[10px] uppercase tracking-wider text-danger">{r.banExpiresAt ? "suspended" : "banned"}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11.5px] text-ink-3">{r.banReason}</p>
                    <div className="mt-1.5">
                      <UserDiscipline userId={r.id} isBanned isVerified={r.isVerified} compact />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Widget>
          <Widget title="Audit log">
            <ul className="space-y-1.5 text-[11.5px] text-ink-2">
              {recentActions.map((a, i) => (
                <li key={i} className="flex gap-2">
                  <span className="num shrink-0 text-ink-4">{timeAgo(a.createdAt)}</span>
                  <span>
                    <span className="font-medium text-ink">{a.action.replace("_", " ")}</span> by {a.moderator ? `f/${a.moderator}` : "system"}
                    {a.reason ? ` — ${a.reason}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Widget>
        </>
      }
    >
      <div className="hairline-b flex items-center gap-1 px-4 py-2.5">
        {(["pending", "approved", "dismissed"] as const).map((s) => (
          <Link key={s} href={`${routes.modQueue()}?status=${s}`} className={`btn btn-sm ${status === s ? "" : "btn-ghost"}`} aria-current={status === s ? "page" : undefined}>
            {s} <span className="num text-ink-3">{countMap.get(s) ?? 0}</span>
          </Link>
        ))}
      </div>
      {rows.length === 0 && (
        <div className="px-6 py-14 text-center">
          <p className="display text-[16px]">No {status} reports</p>
          <p className="mt-1 text-[13px] text-ink-3">The ledger is clean.</p>
        </div>
      )}
      <ul>
        {rows.map(({ report: r, reporter, space }) => {
          const post = r.targetType === "post" ? postMap.get(r.targetId) : undefined;
          const comment = r.targetType === "comment" ? commentMap.get(r.targetId) : undefined;
          const lead = r.targetType === "lead" ? leadMap.get(r.targetId) : undefined;
          const authorId = post?.authorId ?? comment?.authorId ?? lead?.authorId;
          const author = authorId ? authorMap.get(authorId) : undefined;
          const removed = post?.isRemoved ?? comment?.isRemoved ?? lead?.isRemoved ?? false;
          return (
            <li key={r.id} className="ledger-row px-4 py-4">
              <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
                <span className={`tag ${r.reason === "automated_filter" ? "tag-gold" : "tag-ember"}`}>{REPORT_REASON_LABEL[r.reason]}</span>
                <span className="tag">{r.targetType}</span>
                {space?.slug && <span className="num">b/{space.slug}</span>}
                <span className="num">#{r.id}</span>
                <span>by {reporter ? `f/${reporter.username}` : "auto-filter"}</span>
                <span className="num">{timeAgo(r.createdAt)}</span>
                {removed && <span className="tag tag-danger">removed</span>}
              </div>
              <p className="mt-1.5 text-[14px] font-medium">
                {post ? (
                  <Link href={routes.post(post.spaceSlug, post.id, post.slug)} className="hover:underline">
                    {post.title}
                  </Link>
                ) : comment ? (
                  <Link href={`${routes.postShort(comment.postId)}#c-${comment.id}`} className="line-clamp-2 hover:underline">
                    “{comment.body}”
                  </Link>
                ) : lead ? (
                  <Link href={routes.lead(lead.id, lead.slug)} className="hover:underline">
                    {lead.title}
                  </Link>
                ) : (
                  <span className="text-ink-3">Target no longer exists</span>
                )}
              </p>
              {r.details && <p className="mt-1 text-[12.5px] text-ink-2">{r.details}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                {status === "pending" && <ReportDecision reportId={r.id} />}
                {author && (
                  <div className="flex flex-wrap items-center gap-2 border-l border-line pl-4">
                    <span className="num text-[11.5px] text-ink-3">
                      author f/{author.username} · {author.warningCount} warnings
                    </span>
                    <UserDiscipline userId={author.id} isBanned={author.isBanned} isVerified={author.isVerified} compact />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </PageFrame>
  );
}
