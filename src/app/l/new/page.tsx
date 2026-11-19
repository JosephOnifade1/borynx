import { and, desc, eq, isNotNull, ne, or } from "drizzle-orm";
import Link from "next/link";
import { headers } from "next/headers";
import { db } from "@/db";
import { leads, spaces } from "@/db/schema";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { ConfirmLeadIntake } from "@/components/leads/ConfirmLeadIntake";
import { LeadComposer } from "@/components/leads/LeadComposer";
import { LeadPublicationBadge } from "@/components/leads/LeadPublication";
import { PageFrame, PageHeader } from "@/components/PageFrame";
import { getSession, getDemoAccountMode, isSuspended, restrictionMessage } from "@/lib/auth";
import { LEAD_KIND_LABEL } from "@/lib/constants";
import { loadIntakeConfirmation } from "@/lib/email-auth/intakes";
import { emailAuthConfig, isAuthHost } from "@/lib/email-auth/policy";
import { LEAD_SKILLS } from "@/lib/lead-input";
import { findActiveLead } from "@/lib/lead-submissions";
import { formatBudget, routes } from "@/lib/utils";

export const metadata = { title: "Draft a lead", robots: { index: false } };

type Confirmation = Awaited<ReturnType<typeof loadIntakeConfirmation>>;

function ReviewSavedLead({ confirmation }: { confirmation: Confirmation }) {
  const header = <PageHeader eyebrow="Marketplace · private draft" title="Review saved brief" description="Signing in did not submit the lead. Check the details before sending it to reviewers." />;
  if (confirmation?.kind !== "pending") {
    return (
      <PageFrame header={header}>
        <div className="space-y-3 px-4 py-5 sm:px-7 sm:py-6">
          <p role="status" className="text-[14px] text-ink-2">{confirmation?.kind === "submitted" ? "You already submitted this brief." : confirmation?.kind === "expired" ? "This draft is no longer available. Unsubmitted drafts expire after 24 hours." : "This draft is not available for your current sign-in. Open the latest link in the browser where you requested it, or start a new brief."}</p>
          <Link href={confirmation?.kind === "submitted" ? confirmation.href : routes.leadNew()} className="btn btn-primary">{confirmation?.kind === "submitted" ? "View your submission" : "Back to draft a lead"}</Link>
        </div>
      </PageFrame>
    );
  }
  const { brief, id, expiresAt, submissionKey } = confirmation;
  return (
    <PageFrame header={header}>
      <ConfirmLeadIntake id={id} submissionKey={submissionKey}>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          <span className="tag tag-gold">Email confirmed</span>
          <span>Draft expires <time dateTime={expiresAt.toISOString()}>{expiresAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</time></span>
        </div>
        <section className="rounded-md border border-line bg-sunken/30 p-3 sm:p-4" aria-label="Saved brief details">
          <p className="eyebrow">{LEAD_KIND_LABEL[brief.kind]} · {brief.category}</p>
          <h2 className="display mt-1 break-words text-[21px]">{brief.title}</h2>
          <p className="num mt-1 text-[13px] text-ink-2">{formatBudget(brief.budgetMin, brief.budgetMax, brief.currency, brief.budgetUnit)}{brief.budgetUnit === "fixed" ? " fixed" : ""} · {brief.location}</p>
          {brief.deliveryTimeline && <p className="mt-2 text-[13px] text-ink-2">Delivery timeline: {brief.deliveryTimeline}</p>}
          <MarkdownRenderer source={brief.description} className="mt-3 break-words" />
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Skills">{brief.skillTags.map((skill) => <li key={skill} className="tag">{LEAD_SKILLS[skill] ?? skill}</li>)}</ul>
          {(brief.spaceSlug || brief.deadlineAt) && <p className="mt-2 text-[12px] text-ink-3">{brief.spaceSlug && `Space: ${brief.spaceSlug}. `}{brief.deadlineAt && <>Bids due <time dateTime={brief.deadlineAt}>{new Date(brief.deadlineAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</time>.</>}</p>}
        </section>
        <p className="text-[13px] text-ink-2">The brief stays off the public board unless a site reviewer approves it.</p>
      </ConfirmLeadIntake>
    </PageFrame>
  );
}

export default async function NewLeadPage({ searchParams }: { searchParams: Promise<{ intake?: string }> }) {
  const [session, demoAccountMode, requestHeaders, { intake }] = await Promise.all([getSession(), getDemoAccountMode(), headers(), searchParams]);
  const user = session?.user ?? null;
  const config = emailAuthConfig();
  if (intake !== undefined) {
    const confirmation = config && isAuthHost(config, requestHeaders) ? await loadIntakeConfirmation(config, session, intake) : null;
    return <ReviewSavedLead confirmation={confirmation} />;
  }
  const emailIntake = Boolean(config?.canSend && isAuthHost(config, requestHeaders));
  const [availableSpaces, submissions, activeLead] = await Promise.all([
    db.select({ slug: spaces.slug, name: spaces.name }).from(spaces).where(eq(spaces.privacy, "public")).orderBy(spaces.name),
    user ? db.select({ id: leads.id, title: leads.title, state: leads.publicationStatus, status: leads.status, submissionKey: leads.submissionKey }).from(leads)
      .where(and(eq(leads.authorId, user.id), eq(leads.isRemoved, false), or(isNotNull(leads.submissionKey), ne(leads.publicationStatus, "published"))))
      .orderBy(desc(leads.createdAt), desc(leads.id)).limit(20) : Promise.resolve([]),
    user ? findActiveLead(user.id) : null,
  ]);
  return (
    <PageFrame header={<PageHeader eyebrow="Marketplace · new" title="Draft a lead" description="Start with a clear deliverable, budget, and timeline. Posting is free, one active lead at a time. Every brief is reviewed before publication." />}>
      {submissions.length > 0 && (
        <section className="border-b border-line px-4 py-4 sm:px-7" aria-label="Your submissions">
          <h2 className="display text-[16px]">Your submissions</h2>
          <ul className="mt-2 space-y-2">
            {submissions.map((lead) => <li key={lead.id} className="flex flex-wrap items-center gap-2 text-[13px]">
              <LeadPublicationBadge state={lead.state} closed={lead.status === "closed"} legacy={lead.submissionKey === null} />
              <Link href={routes.leadSubmission(lead.id)} className="min-w-0 font-medium [overflow-wrap:anywhere] hover:underline">{lead.title}</Link>
            </li>)}
          </ul>
        </section>
      )}
      {user && isSuspended(user) ? (
        <div className="px-6 py-10 text-center">
          <p className="eyebrow text-danger">Posting restricted</p>
          <p className="mt-2 text-[14px] text-ink-2">{restrictionMessage(user)}</p>
        </div>
      ) : activeLead ? (
        <section aria-label="Active lead limit" className="space-y-3 px-4 py-6 sm:px-7">
          <h2 className="display text-[18px]">You already have an active lead</h2>
          <p className="text-[13px] text-ink-2">A brief awaiting review or correction counts, as does an open listing after its bid deadline. Close, withdraw, or award your current lead before submitting another.</p>
          <p className="text-[13px] font-semibold [overflow-wrap:anywhere]">{activeLead.title}</p>
          <Link href={routes.leadSubmission(activeLead.id)} className="btn btn-primary">Manage active lead</Link>
        </section>
      ) : <LeadComposer spaces={availableSpaces} demoMode={demoAccountMode !== "disabled"} emailIntake={emailIntake} />}
    </PageFrame>
  );
}
