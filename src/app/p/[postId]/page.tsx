import { notFound, redirect } from "next/navigation";
import { canModerateSpace, getCurrentUser } from "@/lib/auth";
import { parsePostId } from "@/lib/post-access";
import { getPostById } from "@/lib/queries";
import { routes } from "@/lib/utils";

/** Global short permalink `/p/:id` → canonical community-scoped permalink. */
export default async function ShortPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const id = parsePostId(postId);
  if (id === null) notFound();
  const user = await getCurrentUser();
  const row = await getPostById(id, user);
  if (!row || (row.post.isRemoved && (!user || !(await canModerateSpace(user, row.space.id))))) notFound();
  redirect(routes.post(row.space.slug, row.post.id, row.post.slug));
}
