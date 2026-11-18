import { notFound, redirect } from "next/navigation";
import { PageFrame, PageHeader } from "@/components/PageFrame";
import { PostComposer } from "@/components/post/PostComposer";
import { getCurrentUser, isSuspended } from "@/lib/auth";
import { parsePostId } from "@/lib/post-access";
import { getPostById } from "@/lib/queries";
import { parseThreadBody } from "@/lib/thread-editor-content";
import { routes } from "@/lib/utils";

export const metadata = { title: "Edit post", robots: { index: false } };

export default async function EditPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const id = parsePostId((await params).postId);
  if (id === null) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`${routes.login()}?next=${encodeURIComponent(routes.postEdit(id))}`);
  if (isSuspended(user)) notFound();
  const row = await getPostById(id, user);
  if (!row || row.post.authorId !== user.id || row.post.isRemoved || row.post.authorDeletedAt) notFound();
  const { post, space } = row;

  return (
    <PageFrame header={<PageHeader eyebrow={`b/${space.slug}`} title="Edit post" description="Your post keeps its link, replies, and votes." accentHue={space.accentHue} />}>
      <PostComposer spaceSlug={space.slug} spaceName={space.name} edit={{
        id: post.id,
        href: routes.post(space.slug, post.id, post.slug),
        title: post.title,
        content: parseThreadBody(post.body),
        editedAt: post.editedAt?.toISOString() ?? null,
      }} />
    </PageFrame>
  );
}
