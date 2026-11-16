import { and, desc, eq } from "drizzle-orm";
import { Lock, MapPin, ShieldCheck, Trophy } from "lucide-react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/db";
import { leadBids, leads, spaces, users, votes } from "@/db/schema";
import { ShareButton, VoteRail } from "@/components/feed/controls";
import { BidForm } from "@/components/forms";
import { AcceptBidButton, LeadStatusSelector } from "@/components/leads/LeadPosterControls";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { PageFrame, Widget } from "@/components/PageFrame";
import { Avatar, VerifiedMark } from "@/components/primitives";
import { ReportButton } from "@/components/shell/ReportModal";
import { UserHoverCard } from "@/components/UserHoverCard";
import { getCurrentUser, isSuspended, restrictionMessage } from "@/lib/auth";
import { LEAD_KIND_LABEL } from "@/lib/constants";
import { formatBudget, routes, timeAgo } from "@/lib/utils";

type Params = Promise<{ leadId: string; rest?: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  try {
    const { leadId } = await params;
    const id = Number.parseInt(leadId, 10);
    if (!Number.isFinite(id)) return { title: "Lead" };
    const [lead] = await db.select({ title: leads.title }).from(leads).where(eq(leads.id, id)).limit(1);
    return { title: lead ? lead.title : "Lead" };
  } catch {
    return { title: "Lead" };
  }
}

/** Canonical: /l/:id/:slug — slug drift redirects. */
export default async function LeadPage({ params }: { params: Params }) {
  const { leadId, rest } = await params;
  const id = Number.parseInt(leadId, 10);
  if (!Number.isFinite(id)) notFound();
  const [row] = await db
    .select({ lead: leads, author: { id: users.id, username: users.username, displayName: users.displayName, avatarHue: users.avatarHue, isVerified: users.isVerified, karma: users.karma, headline: users.headline }, space: { id: spaces.id, slug: spaces.slug, name: spaces.name } })
    .from(leads)
    .innerJoin(users, eq(users.id, leads.authorId))
    .leftJoin(spaces, eq(spaces.id, leads.spaceId))
    .where(eq(leads.id, id))
    .limit(1);
  if (!row) notFound();
  const { lead, author, space } = row;
  const canonical = routes.lead(lead.id, lead.slug);
  if ((rest?.[0] ?? "") !== lead.slug || (rest?.length ?? 0) > 1) permanentRedirect(canonical);

  const user = await getCurrentUser();
  const isStaff = user ? user.role !== "member" : false;
  if (lead.isRemoved && !isStaff) {
    return (
      <PageFrame>
        <div className="px-6 py-16 text-center">
          <p className="eyebrow text-danger">Removed</p>
          <p className="display mt-2 text-[18px]">This lead was removed by a moderator.</p>
          <Link href={routes.leads()} className="btn mt-4">
            Back to the marketplace
          </Link>
        </div>
      </PageFrame>
    );
  }

  const [vote, bids, myBid, [assignedUser]] = await Promise.all([
    user ? db.select({ value: votes.value }).from(votes).where(and(eq(votes.userId, user.id), eq(votes.targetType, "lead"), eq(votes.targetId, lead.id))).limit(1) : Promise.resolve([]),
    db
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
      .orderBy(desc(leadBids.isAccepted), desc(leadBids.createdAt)),
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

  const isOwner = user?.id === lead.authorId;
  const disabledReason = !user
    ? "Sign in to bid on this lead."
    : isSuspended(user)
      ? restrictionMessage(user)
      : isOwner
        ? "This is your lead. Bids appear below as they arrive."
        : lead.status !== "open"
          ? "This lead is no longer accepting bids."
          : myBid.length
            ? "You've already submitted a bid on this lead."
            : null;

  return (
    <PageFrame
      aside={
        <>
          <Widget title="Budget">
            <p className="num text-[22px] font-semibold">{formatBudget(lead.budgetMin, lead.budgetMax, lead.currency)}</p>
            <p className="eyebrow mt-0.5">{lead.kind === "job" ? "per month" : "total budget"}</p>
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
                <dd className={lead.status === "open" ? "text-success" : "text-danger"}>{lead.status.replace("_", " ")}</dd>
              </div>
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
        {!isOwner && !isStaff && bids.length > 0 && <p className="mt-4 text-[12px] text-ink-3">{bids.length} freelancer{bids.length === 1 ? " has" : "s have"} bid. Bid contents are visible to the poster only.</p>}
      </section>
    </PageFrame>
  );
}
