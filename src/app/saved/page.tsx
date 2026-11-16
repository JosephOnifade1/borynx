import { redirect } from "next/navigation";
import { PostFeed } from "@/components/feed/PostFeed";
import { PageFrame, PageHeader } from "@/components/PageFrame";
import { getCurrentUser } from "@/lib/auth";
import { listPosts } from "@/lib/queries";
import { routes } from "@/lib/utils";

export const metadata = { title: "Saved" };

export default async function SavedPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`${routes.login()}?next=/saved`);
  const initialPage = await listPosts({ mode: "new", savedBy: user.id, viewerId: user.id });
  return (
    <PageFrame stream header={<PageHeader eyebrow="Library" title="Saved threads" description="Private to you. Saves are instant and optimistic." />}>
      <PostFeed saved initialMode="new" initialPage={initialPage} emptyTitle="Nothing saved" emptyHint="Hit Save on any thread to keep it here." />
    </PageFrame>
  );
}
