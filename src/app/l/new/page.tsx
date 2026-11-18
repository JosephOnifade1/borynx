import { and, desc, eq, isNotNull, ne, or } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { leads, spaces } from "@/db/schema";
import { LeadComposer } from "@/components/leads/LeadComposer";
import { LeadPublicationBadge } from "@/components/leads/LeadPublication";
import { PageFrame, PageHeader } from "@/components/PageFrame";
import { getCurrentUser, getDemoAccountMode, isSuspended, restrictionMessage } from "@/lib/auth";
import { routes } from "@/lib/utils";

export const metadata = { title: "Draft a lead", robots: { index: false } };

export default async function NewLeadPage() {
  const [user, demoAccountMode] = await Promise.all([getCurrentUser(), getDemoAccountMode()]);
  const [availableSpaces, submissions] = await Promise.all([
    db.select({ slug: spaces.slug, name: spaces.name }).from(spaces).where(eq(spaces.privacy, "public")).orderBy(spaces.name),
    user ? db.select({ id: leads.id, title: leads.title, state: leads.publicationStatus, status: leads.status, submissionKey: leads.submissionKey }).from(leads)
      .where(and(eq(leads.authorId, user.id), eq(leads.isRemoved, false), or(isNotNull(leads.submissionKey), ne(leads.publicationStatus, "published"))))
      .orderBy(desc(leads.createdAt), desc(leads.id)).limit(20) : Promise.resolve([]),
  ]);
  return (
    <PageFrame header={<PageHeader eyebrow="Marketplace · new" title="Draft a lead" description="Describe what needs doing, set a budget, and add relevant skills. A site reviewer approves new briefs before they appear on the board." />}>
      {submissions.length > 0 && (
        <section className="border-b border-line px-4 py-4 sm:px-7" aria-label="Your submissions">
          <h2 className="display text-[16px]">Your submissions</h2>
          <ul className="mt-2 space-y-2">
            {submissions.map((lead) => <li key={lead.id} className="flex flex-wrap items-center gap-2 text-[13px]">
              <LeadPublicationBadge state={lead.state} closed={lead.status === "closed"} legacy={lead.submissionKey === null} />
              <Link href={routes.leadSubmission(lead.id)} className="font-medium hover:underline">{lead.title}</Link>
            </li>)}
          </ul>
        </section>
      )}
      {user && isSuspended(user) ? (
        <div className="px-6 py-10 text-center">
          <p className="eyebrow text-danger">Posting restricted</p>
          <p className="mt-2 text-[14px] text-ink-2">{restrictionMessage(user)}</p>
        </div>
      ) : <LeadComposer spaces={availableSpaces} demoMode={demoAccountMode !== "disabled"} />}
    </PageFrame>
  );
}
