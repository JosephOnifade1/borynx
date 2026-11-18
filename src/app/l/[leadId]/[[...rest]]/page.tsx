import { and, desc, eq, sql } from "drizzle-orm";
import { Lock, MapPin, ShieldCheck, Trophy } from "lucide-react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { cache } from "react";
import { db } from "@/db";
import { leadBids, leads, reports, spaces, users, votes } from "@/db/schema";
import { ShareButton, VoteRail } from "@/components/feed/controls";
import { BidForm } from "@/components/forms";
import { LeadComposer } from "@/components/leads/LeadComposer";
import { LeadPublicationBadge } from "@/components/leads/LeadPublication";
import { LeadReviewControls, WithdrawLeadButton } from "@/components/leads/LeadReviewControls";
import { AcceptBidButton, LeadStatusSelector } from "@/components/leads/LeadPosterControls";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { PageFrame, PageHeader, Widget } from "@/components/PageFrame";
import { Avatar, VerifiedMark } from "@/components/primitives";
import { ReportButton } from "@/components/shell/ReportModal";
import { UserHoverCard } from "@/components/UserHoverCard";
import { getCurrentUser, isSiteStaff, isSuspended, restrictionMessage } from "@/lib/auth";
import { isAcceptingBids, leadDetailAccess, parseLeadId, publicLead } from "@/lib/lead-access";
import { LEAD_SKILLS } from "@/lib/lead-input";
import { LEAD_KIND_LABEL } from "@/lib/constants";
import { formatBudget, routes, timeAgo } from "@/lib/utils";

type Params = Promise<{ leadId: string; rest?: string[] }>;

const loadLead = cache(async (rawId: string) => {
  let id: number;
  try { id = parseLeadId(rawId); } catch { return null; }
  const user = await getCurrentUser();
  const isStaff = Boolean(user && isSiteStaff(user) && !isSuspended(user));
  const [row] = await db.select({
    lead: leads,
    isPublic: sql<boolean>`(${publicLead})`,
    author: { id: users.id, username: users.username, displayName: users.displayName, avatarHue: users.avatarHue, isVerified: users.isVerified, karma: users.karma, headline: users.headline },
    space: { id: spaces.id, slug: spaces.slug, name: spaces.name, privacy: spaces.privacy },
  }).from(leads).innerJoin(users, eq(users.id, leads.authorId)).leftJoin(spaces, eq(spaces.id, leads.spaceId))
    .where(and(eq(leads.id, id), leadDetailAccess(user?.id, isStaff))).limit(1);
  return row ? { ...row, user, isStaff, isOwner: user?.id === row.lead.authorId } : null;
});

type VisibleLead = NonNullable<Awaited<ReturnType<typeof loadLead>>>;
const privateMetadata: Metadata = { title: "Lead", robots: { index: false, follow: false } };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const row = await loadLead((await params).leadId).catch(() => null);
  return row?.isPublic ? { title: row.lead.title } : privateMetadata;
}

function Deadline({ date }: { date: Date }) {
  const iso = date.toISOString();
  return <time dateTime={iso}>{iso.slice(0, 16).replace("T", " ")} UTC</time>;
}

function Skills({ tags }: { tags: string[] }) {
  return tags.length ? <ul aria-label="Skills" className="mt-3 flex flex-wrap gap-1.5">
    {tags.map((skill) => <li key={skill} className="tag">{LEAD_SKILLS[skill] ?? skill}</li>)}
  </ul> : null;
}

async function PrivateLead({ row }: { row: VisibleLead }) {
  const { lead, author, space, isOwner, user, isStaff } = row;
  const closedSubmission = lead.status === "closed" && lead.publicationStatus !== "published";
  const active = !closedSubmission && !lead.isRemoved;
  const canEdit = active && isOwner && Boolean(user && !isSuspended(user));
  const needsChanges = lead.publicationStatus === "changes_requested";
  const canReview = active && isStaff && !isOwner && lead.publicationStatus === "pending_review";
  const canWithdraw = canEdit && (lead.publicationStatus === "pending_review" || needsChanges);
  const [publicSpaces, flags] = await Promise.all([
    canEdit && needsChanges ? db.select({ slug: spaces.slug, name: spaces.name }).from(spaces).where(eq(spaces.privacy, "public")).orderBy(spaces.name) : Promise.resolve([]),
    isStaff ? db.select({ id: reports.id, details: reports.details }).from(reports).where(and(
      eq(reports.targetType, "lead"), eq(reports.targetId, lead.id), eq(reports.status, "pending"), eq(reports.reason, "automated_filter"),
    )).limit(10) : Promise.resolve([]),
  ]);
  const description = lead.isRemoved ? "A report decision removed this lead. It cannot be published."
    : closedSubmission ? (lead.submissionKey === null ? "This older listing is closed and not on the public board." : "The author withdrew this submission. It is not on the board.")
      : needsChanges ? "A site reviewer asked for corrections before publication."
        : lead.publicationStatus === "rejected" ? "A site reviewer did not approve this brief."
          : lead.publicationStatus === "published" ? "This listing is not visible on the public board because of its linked space."
            : "Only the author and site reviewers can see this brief while it waits for review.";
  return (
    <PageFrame header={<PageHeader eyebrow={`Private lead · revision ${lead.revision}`} title={lead.title} description={description} />}>
      <article className="px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          <LeadPublicationBadge state={lead.publicationStatus} removed={lead.isRemoved} closed={closedSubmission} legacy={lead.submissionKey === null} />
          <span className="num">f/{author.username}</span>
          <span className="tag">{LEAD_KIND_LABEL[lead.kind]}</span>
          <span className="tag">{lead.category}</span>
          <span className="num">{formatBudget(lead.budgetMin, lead.budgetMax, lead.currency, lead.budgetUnit)}</span>
          {space && <span className="tag">b/{space.slug}</span>}
        </div>
        <Skills tags={lead.skillTags} />
        {lead.deadlineAt && <p className="mt-2 text-[12.5px] text-ink-3">Bid deadline: <Deadline date={lead.deadlineAt} /></p>}
        <div className="mt-4"><MarkdownRenderer source={lead.description} /></div>
        {lead.reviewNote && <aside className="mt-4 rounded-md border border-line bg-sunken/40 px-3 py-2.5">
          <p className="eyebrow">Reviewer note</p><p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-ink-2">{lead.reviewNote}</p>
        </aside>}
        {flags.length > 0 && <aside className="mt-4 rounded-md border border-line px-3 py-2.5">
          <p className="eyebrow text-danger">Open screening reports</p>
          <ul className="mt-2 space-y-1 text-[12.5px] text-ink-2">{flags.map((flag) => <li key={flag.id}>{flag.details}</li>)}</ul>
        </aside>}
        {canWithdraw && <WithdrawLeadButton leadId={lead.id} />}
        {isStaff && isOwner && active && lead.publicationStatus === "pending_review" && <p className="mt-3 text-[13px] text-ink-3">Another site reviewer must decide on your submission.</p>}
      </article>
      {canReview && <LeadReviewControls key={lead.revision} leadId={lead.id} revision={lead.revision} canPublish={!space || space.privacy === "public"} />}
      {canEdit && needsChanges && <section className="border-t border-line" aria-label="Make corrections">
        <h2 className="display px-4 pt-5 text-[17px] sm:px-7">Revise your brief</h2>
        <LeadComposer key={lead.revision} spaces={publicSpaces} correction={{ id: lead.id, revision: lead.revision, enforceFloor: lead.submissionKey !== null, fields: {
          title: lead.title, description: lead.description, kind: lead.kind, category: lead.category, currency: lead.currency,
          budgetMin: String(lead.budgetMin), budgetMax: String(lead.budgetMax), budgetUnit: lead.budgetUnit ?? "", skillTags: lead.skillTags,
          deadlineAt: lead.deadlineAt?.toISOString().slice(0, 16) ?? "", spaceSlug: space?.privacy === "public" ? space.slug : "", location: lead.location,
        } }} />
      </section>}
    </PageFrame>
  );
}

/** Only public listings get a canonical slug redirect or title in metadata. */
export default async function LeadPage({ params }: { params: Params }) {
  const { leadId, rest } = await params;
  const row = await loadLead(leadId);
  if (!row) notFound();
  if (!row.isPublic) return <PrivateLead row={row} />;
  const { lead, author, space, user, isStaff, isOwner } = row;
  const canonical = routes.lead(lead.id, lead.slug);
  if ((rest?.[0] ?? "") !== lead.slug || (rest?.length ?? 0) > 1) permanentRedirect(canonical);

  const [vote, bids, myBid, [assignedUser]] = await Promise.all([
    user ? db.select({ value: votes.value }).from(votes).where(and(eq(votes.userId, user.id), eq(votes.targetType, "lead"), eq(votes.targetId, lead.id))).limit(1) : Promise.resolve([]),
    isOwner || isStaff ? db
      .select({
        id: leadBids.id,
        amount: leadBids.amount,
        message: leadBids.message,
        isAccepted: leadBids.isAccepted,
        createdAt: leadBids.createdAt,
        username: users.username,
        displayName: users.displayName,
        avatarHue: users.avatarHue,
        isVerified: users.isVerified,
      })
      .from(leadBids)
      .innerJoin(users, eq(users.id, leadBids.userId))
      .where(eq(leadBids.leadId, lead.id))
      .orderBy(desc(leadBids.isAccepted), desc(leadBids.createdAt)) : Promise.resolve([]),
    user ? db.select({ id: leadBids.id }).from(leadBids).where(and(eq(leadBids.leadId, lead.id), eq(leadBids.userId, user.id))).limit(1) : Promise.resolve([]),
    lead.assignedUserId
      ? db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            avatarHue: users.avatarHue,
            isVerified: users.isVerified,
          })
          .from(users)
          .where(eq(users.id, lead.assignedUserId))
          .limit(1)
      : Promise.resolve([null]),
  ]);

  const acceptingBids = isAcceptingBids(lead);
  const disabledReason = !user
    ? "Sign in to bid on this lead."
    : isSuspended(user)
      ? restrictionMessage(user)
      : isOwner
        ? "This is your lead. Bids appear below as they arrive."
        : !acceptingBids
          ? "This lead is no longer accepting bids."
          : myBid.length
            ? "You've already submitted a bid on this lead."
            : null;

  return (
    <PageFrame
      aside={
        <>
          <Widget title="Budget">
            <p className="num text-[22px] font-semibold">{formatBudget(lead.budgetMin, lead.budgetMax, lead.currency, lead.budgetUnit)}</p>
            <p className="eyebrow mt-0.5">{lead.budgetUnit === "hourly" ? "Hourly rate" : lead.budgetUnit === "fixed" ? "Fixed amount" : "Budget unit not recorded"}</p>
            <dl className="mt-3 space-y-1.5 text-[12.5px]">
              <div className="flex justify-between">
                <dt className="text-ink-3">Type</dt>
                <dd>{LEAD_KIND_LABEL[lead.kind]}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">Category</dt>
                <dd>{lead.category}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">Location</dt>
                <dd>{lead.location}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">Status</dt>
                <dd className={acceptingBids ? "text-success" : "text-danger"}>{!acceptingBids && lead.status === "open" ? "Deadline passed" : lead.status.replace("_", " ")}</dd>
              </div>
              {lead.deadlineAt && <div className="flex flex-wrap justify-between gap-x-2">
                <dt className="text-ink-3">Bid deadline</dt>
                <dd className="num"><Deadline date={lead.deadlineAt} /></dd>
              </div>}
              <div className="flex justify-between">
                <dt className="text-ink-3">Bids</dt>
                <dd className="num">{lead.bidCount}</dd>
              </div>
            </dl>
          </Widget>
          <Widget title="Posted by">
            <Link href={routes.profile(author.username)} className="flex items-center gap-2.5">
              <Avatar hue={author.avatarHue} name={author.displayName} size={36} />
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-[13.5px] font-semibold">
                  {author.displayName} {author.isVerified && <VerifiedMark size={12} />}
                </span>
                <span className="block truncate text-[11.5px] text-ink-3">{author.headline}</span>
              </span>
            </Link>
          </Widget>
          <Widget title="Trust signals">
            <ul className="space-y-1.5 text-[12.5px]">
              <li className={`flex items-center gap-2 ${lead.isVerified ? "text-success" : "text-ink-3"}`}>
                <ShieldCheck size={13} /> {lead.isVerified ? "Lead verified by Borynx" : "Awaiting verification"}
              </li>
              <li className={`flex items-center gap-2 ${lead.isEscrowed ? "text-success" : "text-ink-3"}`}>
                <Lock size={13} /> {lead.isEscrowed ? "Funds in escrow" : "No escrow"}
              </li>
              <li className={`flex items-center gap-2 ${author.isVerified ? "text-success" : "text-ink-3"}`}>
                <ShieldCheck size={13} /> {author.isVerified ? "Verified Pro poster" : "Unverified poster"}
              </li>
            </ul>
          </Widget>
        </>
      }
    >
      <article className="px-4 py-5 sm:px-6">
        {lead.isRemoved && <p className="tag tag-danger mb-3">removed · visible to staff</p>}
        {assignedUser && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-gold/40 bg-gold-soft/20 p-3.5">
            <Trophy className="shrink-0 text-gold" size={20} />
            <div className="text-[13px]">
              <span className="font-semibold text-ink">Lead Awarded:</span> A bid by{" "}
              <Link href={routes.profile(assignedUser.username)} className="font-semibold text-ember hover:underline">
                f/{assignedUser.username}
              </Link>{" "}
              was accepted by the poster.
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="tag tag-ember">{LEAD_KIND_LABEL[lead.kind]}</span>
          <span className="tag">{lead.category}</span>
          {space && (
            <Link href={routes.space(space.slug)} className="tag hover:border-ink-3">
              b/{space.slug}
            </Link>
          )}
          <span className="num ml-auto text-[11.5px] text-ink-3">posted {timeAgo(lead.createdAt)} ago</span>
        </div>
        <h1 className="display mt-3 text-[24px] sm:text-[28px]">{lead.title}</h1>
        <p className="mt-1.5 flex items-center gap-3 text-[12.5px] text-ink-3">
          <span className="inline-flex items-center gap-1">
            <MapPin size={12} /> {lead.location}
          </span>
          <UserHoverCard username={author.username}>
            <Link href={routes.profile(author.username)} className="num hover:underline">
              f/{author.username}
            </Link>
          </UserHoverCard>
        </p>
        <div className="mt-5 flex gap-4">
          <div className="hidden sm:block">
            <VoteRail targetType="lead" id={lead.id} upvotes={lead.upvotes} downvotes={lead.downvotes} userVote={vote[0]?.value ?? 0} />
          </div>
          <div className="min-w-0 flex-1">
            <MarkdownRenderer source={lead.description} />
            <Skills tags={lead.skillTags} />
            <div className="mt-5 flex flex-wrap items-center gap-1 border-t border-line pt-3">
              <ShareButton path={canonical} label="Copy attributed link" />
              <ReportButton target={{ type: "lead", id: lead.id, label: lead.title, spaceId: space?.id ?? null }} />
            </div>
          </div>
        </div>
      </article>

      <section id="bid" className="scroll-mt-24 border-t border-line px-4 py-5 sm:px-6" aria-label="Bids">
        <h2 className="display mb-3 text-[16px]">Submit a bid</h2>
        <BidForm leadId={lead.id} disabledReason={disabledReason} />
        {(isOwner || isStaff) && (
          <div className="mt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="eyebrow">Bids received · {bids.length}</h3>
              <LeadStatusSelector leadId={lead.id} currentStatus={lead.status} />
            </div>
            {bids.length === 0 && <p className="text-[13px] text-ink-3">No bids yet.</p>}
            <ul className="divide-y divide-line rounded-md border border-line">
              {bids.map((b) => (
                <li key={b.id} className={`p-3 ${b.isAccepted ? "bg-gold-soft/10 border-l-2 border-l-gold" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                    <Avatar hue={b.avatarHue} name={b.displayName} size={20} />
                    <Link href={routes.profile(b.username)} className="num font-medium text-ink hover:underline">
                      f/{b.username}
                    </Link>
                    {b.isVerified && <VerifiedMark size={11} />}
                    <span className="num ml-auto font-semibold text-ink">{b.amount ? formatBudget(0, b.amount, lead.currency) : "no quote"}</span>
                    <span className="num">{timeAgo(b.createdAt)}</span>
                    <AcceptBidButton
                      leadId={lead.id}
                      bidId={b.id}
                      freelancerName={b.displayName}
                      isAccepted={b.isAccepted}
                    />
                  </div>
                  <p className="mt-1.5 text-[13px] text-ink-2">{b.message}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!isOwner && !isStaff && lead.bidCount > 0 && <p className="mt-4 text-[12px] text-ink-3">{lead.bidCount} freelancer{lead.bidCount === 1 ? " has" : "s have"} bid. Bid contents are visible to the poster only.</p>}
      </section>
    </PageFrame>
  );
}
