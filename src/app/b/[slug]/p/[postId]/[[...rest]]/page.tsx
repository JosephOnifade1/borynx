import { and, eq } from "drizzle-orm";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/db";
import { saves, votes } from "@/db/schema";
import { SaveButton, ShareButton, VoteRail } from "@/components/feed/controls";
import { PostActions } from "@/components/post/PostActions";
import { ThreadBody } from "@/components/post/ThreadBody";
import { PageFrame, Widget } from "@/components/PageFrame";
import { CommentThread } from "@/components/post/CommentThread";
import { Avatar, RegionErrorBoundary, VerifiedMark } from "@/components/primitives";
import { ReportButton } from "@/components/shell/ReportModal";
import { UserHoverCard } from "@/components/UserHoverCard";
import { canModerateSpace, getCurrentUser, isSuspended } from "@/lib/auth";
import { POST_KIND_LABEL } from "@/lib/constants";
import { parsePostId } from "@/lib/post-access";
import { getPostById, listComments } from "@/lib/queries";
import { routes, timeAgo } from "@/lib/utils";

type Params = Promise<{ slug: string; postId: string; rest?: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  try {
    const { postId } = await params;
    const id = parsePostId(postId);
    const row = id !== null ? await getPostById(id, await getCurrentUser()) : null;
    if (!row || row.post.isRemoved || row.post.authorDeletedAt) {
      return { title: row?.post.authorDeletedAt ? "Deleted post" : "Thread", robots: { index: false, follow: false } };
    }
    return { title: row.post.title };
  } catch {
    return { title: "Thread", robots: { index: false, follow: false } };
  }
}

/**
 * Canonical permalink: /b/:space/p/:id/:slug
 * Live threads retain their original slug after edits. Deleted threads use a neutral slug.
 */
export default async function PostPage({ params }: { params: Params }) {
  const { slug, postId, rest } = await params;
  const id = parsePostId(postId);
  if (id === null) notFound();
  const user = await getCurrentUser();
  const row = await getPostById(id, user);
  if (!row) notFound();
  const { post, author, space } = row;
  const canonical = routes.post(space.slug, post.id, post.slug);
  const canMod = user ? await canModerateSpace(user, space.id) : false;
  const ownsPost = user?.id === post.authorId;
  const canEdit = Boolean(ownsPost && user && !isSuspended(user) && !post.isRemoved && !post.authorDeletedAt);
  const isCanonical = slug === space.slug && (rest?.[0] ?? "") === post.slug && (rest?.length ?? 0) <= 1;
  if (post.authorDeletedAt && !isCanonical) redirect(canonical);
  if (post.isRemoved && !canMod) {
    return (
      <PageFrame>
        <div className="px-6 py-16 text-center">
          <p className="eyebrow text-danger">Removed</p>
          <p className="display mt-2 text-[18px]">This thread was removed by a moderator.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href={routes.space(space.slug)} className="btn">Back to b/{space.slug}</Link>
            {ownsPost && !post.authorDeletedAt && <PostActions postId={post.id} canEdit={false} />}
          </div>
        </div>
      </PageFrame>
    );
  }

  if (!isCanonical) permanentRedirect(canonical);

  if (post.authorDeletedAt) {
    const previousReplies = await listComments(post.id, user?.id ?? null);
    return (
      <PageFrame>
        <div className="px-5 py-10 sm:px-6">
          <p className="eyebrow">Deleted post</p>
          <h1 className="display mt-2 text-[20px]">This post was deleted by its author.</h1>
          <p className="mt-2 text-[13px] text-ink-3">New replies are closed.</p>
          <Link href={routes.space(space.slug)} className="btn mt-4">Back to b/{space.slug}</Link>
        </div>
        {previousReplies.length > 0 && (
          <div className="border-t border-line">
            <RegionErrorBoundary region="comments">
              <CommentThread postId={post.id} postAuthorId={null} postHref={canonical} spaceId={space.id} canModerate={false} initialCount={previousReplies.length} initialComments={previousReplies} locked />
            </RegionErrorBoundary>
          </div>
        )}
      </PageFrame>
    );
  }

  const [vote, saved, initialComments] = await Promise.all([
    user ? db.select({ value: votes.value }).from(votes).where(and(eq(votes.userId, user.id), eq(votes.targetType, "post"), eq(votes.targetId, post.id))).limit(1) : Promise.resolve([]),
    user ? db.select().from(saves).where(and(eq(saves.userId, user.id), eq(saves.postId, post.id))).limit(1) : Promise.resolve([]),
    listComments(post.id, user?.id ?? null),
  ]);
  const editTime = post.editedAt ? timeAgo(post.editedAt) : null;

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
          {post.editedAt && (
            <time className="num" dateTime={post.editedAt.toISOString()} title={post.editedAt.toISOString()}>
              Edited {editTime === "now" ? "just now" : `${editTime} ago`}
            </time>
          )}
          <span className="tag ml-1">{POST_KIND_LABEL[post.kind]}</span>
          {post.isSolved && (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 size={13} /> solved
            </span>
          )}
        </div>
        <div className="mt-2 flex items-start justify-between gap-3">
          <h1 className="display min-w-0 break-words text-[24px] sm:text-[28px]">{post.title}</h1>
          {ownsPost && <PostActions postId={post.id} canEdit={canEdit} />}
        </div>
        <div className="mt-5 flex gap-4">
          <div className="hidden sm:block">
            <VoteRail targetType="post" id={post.id} upvotes={post.upvotes} downvotes={post.downvotes} userVote={vote[0]?.value ?? 0} />
          </div>
          <div className="min-w-0 flex-1">
            <ThreadBody source={post.body} />
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
          <CommentThread postId={post.id} postAuthorId={post.authorId} postHref={canonical} spaceId={space.id} canModerate={canMod} locked={post.isRemoved} initialCount={post.commentCount} initialComments={initialComments} />
        </RegionErrorBoundary>
      </div>
    </PageFrame>
  );
}
