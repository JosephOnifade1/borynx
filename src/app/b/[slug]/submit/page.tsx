import { notFound, permanentRedirect, redirect } from "next/navigation";
import { PostComposer } from "@/components/post/PostComposer";
import { PageFrame, PageHeader } from "@/components/PageFrame";
import { getCurrentUser, isSuspended, restrictionMessage } from "@/lib/auth";
import { resolveSpace } from "@/lib/queries";
import { routes } from "@/lib/utils";

export default async function SubmitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resolved = await resolveSpace(slug);
  if (!resolved) notFound();
  if (!resolved.canonical) permanentRedirect(routes.spaceSubmit(resolved.space.slug));
  const user = await getCurrentUser();
  if (!user) redirect(`${routes.login()}?next=${encodeURIComponent(routes.spaceSubmit(resolved.space.slug))}`);

  return (
    <PageFrame header={<PageHeader accentHue={resolved.space.accentHue} eyebrow={`New thread · b/${resolved.space.slug}`} title="Start a thread" description={resolved.space.rules.length ? `House rules: ${resolved.space.rules.join(" · ")}` : undefined} />}>
      {isSuspended(user) ? (
        <div className="px-6 py-10 text-center">
          <p className="eyebrow text-danger">Posting restricted</p>
          <p className="mt-2 text-[14px] text-ink-2">{restrictionMessage(user)}</p>
        </div>
      ) : (
        <PostComposer spaceSlug={resolved.space.slug} spaceName={resolved.space.name} />
      )}
    </PageFrame>
  );
}
