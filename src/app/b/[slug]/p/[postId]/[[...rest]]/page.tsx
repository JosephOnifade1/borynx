import { and, eq } from "drizzle-orm";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/db";
import { saves, votes } from "@/db/schema";
import { SaveButton, ShareButton, VoteRail } from "@/components/feed/controls";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { PageFrame, Widget } from "@/components/PageFrame";
import { CommentThread } from "@/components/post/CommentThread";
import { Avatar, RegionErrorBoundary, VerifiedMark } from "@/components/primitives";
import { ReportButton } from "@/components/shell/ReportModal";
import { UserHoverCard } from "@/components/UserHoverCard";
import { canModerateSpace, getCurrentUser } from "@/lib/auth";
import { POST_KIND_LABEL } from "@/lib/constants";
import { getPostById, listComments } from "@/lib/queries";
import { routes, timeAgo } from "@/lib/utils";

type Params = Promise<{ slug: string; postId: string; rest?: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  try {
    const { postId } = await params;
    const id = Number.parseInt(postId, 10);
    const row = Number.isFinite(id) ? await getPostById(id) : null;
    return { title: row ? row.post.title : "Thread" };
  } catch {
    return { title: "Thread" };
  }
}

/**
 * Canonical permalink: /b/:space/p/:id/:slug
 * Any mismatch in space or slug (renamed space, edited title, legacy alias) 308s to the canonical form.
 */
export default async function PostPage({ params }: { params: Params }) {
  const { slug, postId, rest } = await params;
  const id = Number.parseInt(postId, 10);
  if (!Number.isFinite(id)) notFound();
  const row = await getPostById(id);
  if (!row) notFound();
  const { post, author, space } = row;
  const canonical = routes.post(space.slug, post.id, post.slug);
  if (slug !== space.slug || (rest?.[0] ?? "") !== post.slug || (rest?.length ?? 0) > 1) permanentRedirect(canonical);

  const user = await getCurrentUser();
  const [vote, saved, canMod, initialComments] = await Promise.all([
    user ? db.select({ value: votes.value }).from(votes).where(and(eq(votes.userId, user.id), eq(votes.targetType, "post"), eq(votes.targetId, post.id))).limit(1) : Promise.resolve([]),
    user ? db.select().from(saves).where(and(eq(saves.userId, user.id), eq(saves.postId, post.id))).limit(1) : Promise.resolve([]),
    user ? canModerateSpace(user, space.id) : Promise.resolve(false),
    listComments(post.id, user?.id ?? null),
  ]);

  if (post.isRemoved && !canMod) {
    return (
      <PageFrame>
        <div className="px-6 py-16 text-center">
          <p className="eyebrow text-danger">Removed</p>
          <p className="display mt-2 text-[18px]">This thread was removed by a moderator.</p>
          <Link href={routes.space(space.slug)} className="btn mt-4">
            Back to b/{space.slug}
          </Link>
        </div>
      </PageFrame>
    );
  }

  return (
    <PageFrame
      aside={
        <>
          <Widget title="Author">
            <Link href={routes.profile(author.username)} className="flex items-center gap-2.5">
              <Avatar hue={author.avatarHue} name={author.displayName} size={36} />
              <span>
                <span className="flex items-center gap-1 text-[13.5px] font-semibold">
                  {author.displayName} {author.isVerified && <VerifiedMark size={12} />}
                </span>
                <span className="num block text-[11px] text-ink-3">
                  f/{author.username} · {author.karma.toLocaleString("en-US")} karma
                </span>
              </span>
            </Link>
          </Widget>
          <Widget title="Space">
            <Link href={routes.space(space.slug)} className="flex items-center gap-2.5">
              <span className="h-8 w-8 rounded-md" style={{ background: `hsl(${space.accentHue} 60% 48%)` }} />
              <span>
                <span className="num block text-[13px] font-semibold">b/{space.slug}</span>
                <span className="block text-[11.5px] text-ink-3">{space.name}</span>
              </span>
            </Link>
          </Widget>
          <Widget title="Karma on this thread">
            <p className="text-[12.5px] text-ink-2">
              {POST_KIND_LABEL[post.kind]} threads earn <span className="num font-semibold text-ink">{post.kind === "resource" || post.kind === "help" ? "1.5×" : "1×"}</span> per net upvote. An accepted solution pays the commenter <span className="num font-semibold text-ink">10×</span>.
            </p>
          </Widget>
        </>
      }
    >
      <article className="px-4 py-5 sm:px-6">
        {post.isRemoved && <p className="tag tag-danger mb-3">removed · visible to moderators</p>}
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          <Link href={routes.space(space.slug)} className="num font-medium text-ink hover:underline">
            b/{space.slug}
          </Link>
          <span>·</span>
          <UserHoverCard username={author.username}>
            <Link href={routes.profile(author.username)} className="num text-ink-2 hover:underline">
              f/{author.username}
            </Link>
          </UserHoverCard>
          {author.isVerified && <VerifiedMark size={11} />}
          <span>·</span>
          <time className="num" dateTime={post.createdAt.toISOString()}>
            {timeAgo(post.createdAt)} ago
          </time>
          <span className="tag ml-1">{POST_KIND_LABEL[post.kind]}</span>
          {post.isSolved && (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 size={13} /> solved
            </span>
          )}
        </div>
        <h1 className="display mt-2 text-[24px] sm:text-[28px]">{post.title}</h1>
        <div className="mt-5 flex gap-4">
          <div className="hidden sm:block">
            <VoteRail targetType="post" id={post.id} upvotes={post.upvotes} downvotes={post.downvotes} userVote={vote[0]?.value ?? 0} />
          </div>
          <div className="min-w-0 flex-1">
            <MarkdownRenderer source={post.body} />
            <div className="mt-5 flex flex-wrap items-center gap-1 border-t border-line pt-3">
              <div className="sm:hidden">
                <VoteRail targetType="post" id={post.id} upvotes={post.upvotes} downvotes={post.downvotes} userVote={vote[0]?.value ?? 0} orientation="horizontal" size="sm" />
              </div>
              <SaveButton postId={post.id} saved={saved.length > 0} />
              <ShareButton path={canonical} label="Copy attributed link" />
              <ReportButton target={{ type: "post", id: post.id, label: post.title, spaceId: space.id }} />
            </div>
          </div>
        </div>
      </article>
      <div className="border-t border-line">
        <RegionErrorBoundary region="comments">
          <CommentThread postId={post.id} postAuthorId={post.authorId} postHref={canonical} spaceId={space.id} canModerate={canMod} initialCount={post.commentCount} initialComments={initialComments} />
        </RegionErrorBoundary>
      </div>
    </PageFrame>
  );
}
