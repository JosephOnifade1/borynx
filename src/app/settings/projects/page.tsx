import Link from "next/link";
import { redirect } from "next/navigation";
import { ProjectsManager } from "@/components/portfolio/ProjectsManager";
import { PageFrame, PageHeader } from "@/components/PageFrame";
import { getCurrentUser, isSuspended } from "@/lib/auth";
import { listOwnedProjects } from "@/lib/portfolio";
import { routes } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portfolio projects", robots: { index: false } };

export default async function SettingsProjectsPage() {
  const owner = await getCurrentUser();
  if (!owner) redirect(`${routes.login()}?next=${routes.settingsProjects()}`);
  const items = await listOwnedProjects(owner.id);

  return (
    <PageFrame stream header={<PageHeader eyebrow="Profile settings" title="Portfolio projects"
      description="Show what you built and what changed. Publish only what you want visitors to see; drafts and their covers stay private."
      actions={<>
        <Link href={routes.settings()} className="btn btn-ghost btn-sm">Profile settings</Link>
        <Link href={routes.profileProjects(owner.username)} className="btn btn-sm">View public projects</Link>
      </>} />}>
      <ProjectsManager ownerId={owner.id} initialItems={items} restricted={isSuspended(owner)} />
    </PageFrame>
  );
}
