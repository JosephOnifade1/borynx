import { redirect } from "next/navigation";
import { db } from "@/db";
import { spaces } from "@/db/schema";
import { LeadComposer } from "@/components/forms";
import { PageFrame, PageHeader } from "@/components/PageFrame";
import { getCurrentUser, isSuspended, restrictionMessage } from "@/lib/auth";
import { routes } from "@/lib/utils";

export const metadata = { title: "Post a lead" };

export default async function NewLeadPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`${routes.login()}?next=${routes.leadNew()}`);
  const all = await db.select({ slug: spaces.slug, name: spaces.name }).from(spaces).orderBy(spaces.slug);
  return (
    <PageFrame header={<PageHeader eyebrow="Marketplace · new" title="Post a lead" description="Be specific about scope, deliverables and how you evaluate bids. Vague briefs attract vague bids." />}>
      {isSuspended(user) ? (
        <div className="px-6 py-10 text-center">
          <p className="eyebrow text-danger">Posting restricted</p>
          <p className="mt-2 text-[14px] text-ink-2">{restrictionMessage(user)}</p>
        </div>
      ) : (
        <LeadComposer spaces={all} />
      )}
    </PageFrame>
  );
}
