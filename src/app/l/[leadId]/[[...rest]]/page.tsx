import { and, desc, eq, sql } from "drizzle-orm";
import { MapPin } from "lucide-react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { cache } from "react";
import { db } from "@/db";
import { leadBids, leads, reports, spaces, users, votes } from "@/db/schema";
import { ShareButton, VoteRail } from "@/components/feed/controls";
import { BidForm } from "@/components/leads/BidForm";
import { LeadServiceOffers } from "@/components/leads/LeadServiceOffers";
import { BuyerReview } from "@/components/leads/BuyerReview";
import { LeadComposer } from "@/components/leads/LeadComposer";
import { LeadEngagementBadge } from "@/components/leads/LeadEngagementBadge";
import { LeadKickoff } from "@/components/leads/LeadKickoff";
import { LeadPublicationBadge } from "@/components/leads/LeadPublication";
import { LeadSaveButton } from "@/components/leads/LeadSaveButton";
import { LeadReviewControls, WithdrawLeadButton } from "@/components/leads/LeadReviewControls";
import { AwardBidButton, LeadOutcomeControls } from "@/components/leads/LeadPosterControls";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { PageFrame, PageHeader, Widget } from "@/components/PageFrame";
import { Avatar, VerifiedMark } from "@/components/primitives";
import { ReportButton } from "@/components/shell/ReportModal";
import { UserHoverCard } from "@/components/UserHoverCard";
import { getCurrentUser, isSiteStaff, isSuspended, restrictionMessage } from "@/lib/auth";
import { leadDetailAccess, parseLeadId, publicLead } from "@/lib/lead-access";
import { canSelectBid, getLeadEngagement, matchesLeadAward } from "@/lib/lead-engagement";
import { LEAD_SKILLS } from "@/lib/lead-input";
import { getLeadKickoff } from "@/lib/lead-kickoff";
import { getBuyerReviewSlot } from "@/lib/lead-reviews";
import { isLeadSaved } from "@/lib/lead-saves";
import { LEAD_KIND_LABEL, leadBudgetUnitLabel } from "@/lib/constants";
import { formatBudget, leadSlugSegment, routes, timeAgo } from "@/lib/utils";

// Sessions determine which private pitches or kickoff details, if any, are in the response.
export const dynamic = "force-dynamic";

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

function UtcTime({ date }: { date: Date }) {
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
  const active = canSelectBid(lead) && !lead.isRemoved;
  const canEdit = active && isOwner && Boolean(user && !isSuspended(user));
  const needsChanges = lead.publicationStatus === "changes_requested";
  const canReview = active && isStaff && !isOwner && lead.publicationStatus === "pending_review";
  const canWithdraw = canEdit && (lead.publicationStatus === "pending_review" || needsChanges);
  const canCloseListing = canEdit && lead.publicationStatus === "published";
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
            : !active ? "This older listing is private and is not open for submission review."
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
        {lead.deliveryTimeline && <p className="mt-3 text-[12.5px] text-ink-2">Delivery timeline: {lead.deliveryTimeline}</p>}
        {lead.deadlineAt && <p className="mt-2 text-[12.5px] text-ink-3">Bid deadline: <UtcTime date={lead.deadlineAt} /></p>}
        <div className="mt-4"><MarkdownRenderer source={lead.description} /></div>
        {lead.reviewNote && <aside className="mt-4 rounded-md border border-line bg-sunken/40 px-3 py-2.5">
          <p className="eyebrow">Reviewer note</p><p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-ink-2">{lead.reviewNote}</p>
        </aside>}
        {flags.length > 0 && <aside className="mt-4 rounded-md border border-line px-3 py-2.5">
          <p className="eyebrow text-danger">Open screening reports</p>
          <ul className="mt-2 space-y-1 text-[12.5px] text-ink-2">{flags.map((flag) => <li key={flag.id}>{flag.details}</li>)}</ul>
        </aside>}
        {canWithdraw && <WithdrawLeadButton leadId={lead.id} />}
        {canCloseListing && <div className="mt-4"><LeadOutcomeControls leadId={lead.id} awarded={false} /></div>}
        {isStaff && isOwner && active && lead.publicationStatus === "pending_review" && <p className="mt-3 text-[13px] text-ink-3">Another site reviewer must decide on your submission.</p>}
      </article>
      {canReview && <LeadReviewControls key={lead.revision} leadId={lead.id} revision={lead.revision} canPublish={!space || space.privacy === "public"} />}
      {canEdit && needsChanges && <section className="border-t border-line" aria-label="Make corrections">
        <h2 className="display px-4 pt-5 text-[17px] sm:px-7">Revise your brief</h2>
        <LeadComposer key={lead.revision} spaces={publicSpaces} correction={{ id: lead.id, revision: lead.revision, enforceFloor: lead.submissionKey !== null, fields: {
          title: lead.title, description: lead.description, deliveryTimeline: lead.deliveryTimeline ?? "", kind: lead.kind, category: lead.category, currency: lead.currency,
          budgetMin: String(lead.budgetMin), budgetMax: String(lead.budgetMax), budgetUnit: lead.budgetUnit ?? "", skillTags: lead.skillTags,
          deadlineAt: lead.deadlineAt?.toISOString().slice(0, 16) ?? "", spaceSlug: space?.privacy === "public" ? space.slug : "", location: lead.location,
        } }} />
      </section>}
    </PageFrame>
  );
}

/** Only public listings get a canonical slug redirect or title in metadata. */
export default async function LeadPage({ params, searchParams }: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { leadId, rest } = await params;
  const row = await loadLead(leadId);
  if (!row) notFound();
  if (!row.isPublic) return <PrivateLead row={row} />;
  const { lead, author, space, user, isOwner } = row;
  const canonical = routes.lead(lead.id, lead.slug);
  if (leadId !== String(lead.id) || rest?.length !== 1 || rest[0] !== leadSlugSegment(lead.slug)) {
    const query = new URLSearchParams();
    for (const [key, values] of Object.entries(await searchParams)) {
      for (const value of typeof values === "string" ? [values] : values ?? []) query.append(key, value);
    }
    permanentRedirect(query.size ? `${canonical}?${query}` : canonical);
  }

  const suspended = user ? isSuspended(user) : false;
  const canManage = isOwner && !suspended;
  const [saved, vote, pitches, reviewSlot, kickoff] = await Promise.all([
    user ? isLeadSaved(user.id, lead.id) : false,
    user ? db.select({ value: votes.value }).from(votes).where(and(eq(votes.userId, user.id), eq(votes.targetType, "lead"), eq(votes.targetId, lead.id))).limit(1) : Promise.resolve([]),
    // Scope the query itself: the poster sees all, a bidder sees only their own, and staff
    // have no pitch access just by holding a moderation role.
    user ? db.select({
      id: leadBids.id,
      leadId: leadBids.leadId,
      userId: leadBids.userId,
      amount: leadBids.amount,
      message: leadBids.message,
      isAccepted: leadBids.isAccepted,
      createdAt: leadBids.createdAt,
      username: users.username,
      displayName: users.displayName,
      avatarHue: users.avatarHue,
    }).from(leadBids).innerJoin(users, eq(users.id, leadBids.userId))
      .where(and(eq(leadBids.leadId, lead.id), isOwner ? undefined : eq(leadBids.userId, user.id)))
      .orderBy(desc(leadBids.isAccepted), desc(leadBids.createdAt), desc(leadBids.id)) : Promise.resolve([]),
    canManage && user && lead.status === "completed" ? getBuyerReviewSlot(lead.id, user.id) : undefined,
    user && !suspended && lead.status === "awarded" && (isOwner || lead.assignedUserId === user.id) ? getLeadKickoff(lead.id, user.id) : null,
  ]);

  const engagement = getLeadEngagement(lead);
  const canAward = canManage && canSelectBid(lead);
  const hasWinner = pitches.some((pitch) => matchesLeadAward(lead, pitch));
  const canFinish = canManage && lead.status === "awarded" && hasWinner;
  const description = engagement === "completed" ? "Buyer marked this lead complete. Borynx does not verify work or payment."
    : engagement === "awarded" ? "The buyer selected a pitch. The work has not been marked complete."
      : engagement === "cancelled" ? "The buyer cancelled the engagement after selecting a pitch."
        : engagement === "closed" ? "This lead was closed without selecting a winner."
          : null;
  const budget = formatBudget(lead.budgetMin, lead.budgetMax, lead.currency, lead.budgetUnit);
  const budgetUnit = leadBudgetUnitLabel(lead.budgetUnit);
  const quote = (amount: number) => amount > 0
    ? `${formatBudget(0, amount, lead.currency, lead.budgetUnit)}${lead.budgetUnit === "fixed" ? " fixed" : ""}`
    : "No quote recorded";

  return (
    <PageFrame
      aside={
        <>
          <Widget title="Budget">
            <p className="num text-[22px] font-semibold">{budget}</p>
            <p className="eyebrow mt-0.5">{budgetUnit}</p>
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
              {lead.deadlineAt && <div className="flex flex-wrap justify-between gap-x-2">
                <dt className="text-ink-3">Bid deadline</dt>
                <dd className="num"><UtcTime date={lead.deadlineAt} /></dd>
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
        </>
      }
    >
      <article className="px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="tag tag-ember">{LEAD_KIND_LABEL[lead.kind]}</span>
          <span className="tag">{lead.category}</span>
          <LeadEngagementBadge engagement={engagement} />
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
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line px-3 py-2.5 text-[12.5px] text-ink-3 xl:hidden">
          <span className="num font-semibold text-ink">{budget}</span>
          <span>{budgetUnit}</span>
          {lead.deadlineAt && <span>Bid deadline: <UtcTime date={lead.deadlineAt} /></span>}
        </div>
        {description && <div className="mt-4 rounded-md border border-line bg-sunken/40 px-3 py-2.5 text-[13px] text-ink-2">
          <p>{description}</p>
          {lead.awardedAt && <p className="mt-1 text-[12px] text-ink-3">Awarded <UtcTime date={lead.awardedAt} /></p>}
          {lead.completedAt && engagement === "completed" && <p className="mt-1 text-[12px] text-ink-3">Completed <UtcTime date={lead.completedAt} /></p>}
        </div>}
        <div className="mt-5 flex gap-4">
          <div className="hidden sm:block">
            <VoteRail targetType="lead" id={lead.id} upvotes={lead.upvotes} downvotes={lead.downvotes} userVote={vote[0]?.value ?? 0} />
          </div>
          <div className="min-w-0 flex-1">
            <MarkdownRenderer source={lead.description} />
            {lead.deliveryTimeline && <p className="mt-4 text-[13px] text-ink-2"><strong>Delivery timeline:</strong> {lead.deliveryTimeline}</p>}
            <Skills tags={lead.skillTags} />
            <div className="mt-5 flex flex-wrap items-center gap-1 border-t border-line pt-3">
              <LeadSaveButton leadId={lead.id} saved={saved} />
              <ShareButton path={canonical} label="Copy attributed link" />
              <ReportButton target={{ type: "lead", id: lead.id, label: lead.title, spaceId: space?.id ?? null }} />
            </div>
          </div>
        </div>
      </article>

      {kickoff && <LeadKickoff key={`${lead.id}:${user?.id}`} leadId={lead.id} kickoff={kickoff} />}
      {reviewSlot && <BuyerReview key={lead.id} leadId={lead.id} {...reviewSlot} />}

      {canManage && engagement === "open" && lead.status === "open" && lead.publishedAt && lead.reviewedAt && (
        <LeadServiceOffers leadId={lead.id} ownerId={lead.authorId} />
      )}
      <section id="bid" className="scroll-mt-24 space-y-4 border-t border-line px-4 py-5 sm:px-6" aria-label={isOwner ? "Pitches received" : "Pitches"}>
        {isOwner ? (
          <>
            <h2 className="display text-[16px]">Pitches received <span className="num text-[13px] text-ink-3">· {pitches.length}</span></h2>
            <p className="text-[13px] text-ink-3">Pitches and quotes are private to you and the bidder who submitted each one.</p>
            {lead.awardNeedsReview && <p className="rounded-md border border-gold/40 px-3 py-2 text-[13px]">This older award record needs review. Bidding and outcome changes are paused.</p>}
            {user && suspended && <p className="text-[13px] text-danger">{restrictionMessage(user)}</p>}
            {(canAward || canFinish) && <LeadOutcomeControls key={canFinish ? "awarded" : "unawarded"} leadId={lead.id} awarded={canFinish} />}
            {pitches.length === 0 ? <p className="text-[13px] text-ink-3">No pitches yet.</p> : (
              <ul className="divide-y divide-line rounded-md border border-line">
                {pitches.map((pitch) => (
                  <li key={pitch.id} className="p-3 sm:p-4">
                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                      <Avatar hue={pitch.avatarHue} name={pitch.displayName} size={24} />
                      <Link href={routes.profile(pitch.username)} className="num font-medium text-ink hover:underline">f/{pitch.username}</Link>
                      {matchesLeadAward(lead, pitch) && <span className="tag tag-gold">{engagement === "cancelled" ? "Originally selected" : "Winning pitch"}</span>}
                      <span className="num ml-auto font-semibold text-ink">{quote(pitch.amount)}</span>
                      <time dateTime={pitch.createdAt.toISOString()} className="num">{timeAgo(pitch.createdAt)}</time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-[13px] text-ink-2">{pitch.message}</p>
                    <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <Link href={routes.profileProjects(pitch.username)} className="text-[13px] font-medium text-verdigris hover:underline">View projects</Link>
                      {kickoff && matchesLeadAward(lead, pitch) && <a href="#kickoff" className="text-[13px] font-medium text-ember hover:underline">{kickoff.details ? "View private kickoff" : "Send kickoff details"}</a>}
                      {canAward && pitch.userId !== lead.authorId && <AwardBidButton leadId={lead.id} bidId={pitch.id} bidderName={pitch.displayName} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : pitches[0] ? (
          <>
            <h2 className="display text-[16px]">Your pitch</h2>
            <div className="rounded-md border border-line p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="num text-[13px] font-semibold">{quote(pitches[0].amount)}</span>
                <span className={`tag ${matchesLeadAward(lead, pitches[0]) ? "tag-gold" : ""}`}>
                  {matchesLeadAward(lead, pitches[0]) ? (engagement === "cancelled" ? "Originally selected" : "Winning pitch") : "Submitted"}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-[13px] text-ink-2">{pitches[0].message}</p>
            </div>
            {kickoff && <a href="#kickoff" className="text-[13px] font-medium text-ember hover:underline">Go to private kickoff</a>}
            <p className="text-[12.5px] text-ink-3">Only you and the poster can see your pitch.</p>
          </>
        ) : (
          <>
            <h2 className="display text-[16px]">Send a pitch</h2>
            {engagement !== "open" ? <p className="text-[13px] text-ink-3">This lead is no longer accepting pitches.</p>
              : !user ? <p className="text-[13px] text-ink-3"><Link href={`${routes.login()}?next=${encodeURIComponent(`${canonical}#bid`)}`} className="font-medium text-ember hover:underline">Sign in</Link> to send a private pitch.</p>
                : suspended ? <p className="text-[13px] text-danger">{restrictionMessage(user)}</p>
                  : <BidForm leadId={lead.id} currency={lead.currency} budgetUnit={lead.budgetUnit} />}
          </>
        )}
      </section>
    </PageFrame>
  );
}
