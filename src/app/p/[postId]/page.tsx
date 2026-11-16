import { notFound, permanentRedirect } from "next/navigation";
import { getPostById } from "@/lib/queries";
import { routes } from "@/lib/utils";

/** Global short permalink `/p/:id` → canonical community-scoped permalink. */
export default async function ShortPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const id = Number.parseInt(postId, 10);
  if (!Number.isFinite(id)) notFound();
  const row = await getPostById(id);
  if (!row) notFound();
  permanentRedirect(routes.post(row.space.slug, row.post.id, row.post.slug));
}
