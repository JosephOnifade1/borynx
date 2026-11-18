"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { MapPin, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { LeadRowSkeleton, VerifiedMark } from "@/components/primitives";
import { ReportButton } from "@/components/shell/ReportModal";
import { UserHoverCard } from "@/components/UserHoverCard";
import { useSession } from "@/components/providers";
import { api, queryKeys } from "@/lib/client";
import { LEAD_KIND_LABEL, leadBudgetUnitLabel } from "@/lib/constants";
import { LEAD_SKILLS } from "@/lib/lead-input";
import { leadFiltersParams, type LeadFilters } from "@/lib/lead-discovery";
import type { CursorPage, FeedLead, LeadFeedPage } from "@/lib/types";
import { formatBudget, routes, timeAgo } from "@/lib/utils";
import { ShareButton, VoteRail } from "../feed/controls";
import { LeadEngagementBadge } from "./LeadEngagementBadge";
import { LeadFilterControls } from "./LeadFilterControls";
import { LeadSaveButton } from "./LeadSaveButton";

const KIND_TAG: Record<FeedLead["kind"], string> = { bounty: "tag tag-ember", contract: "tag tag-verdigris", job: "tag tag-gold" };

/** Marketplace job card: vote pill · type/category/trust badges · title · inline budget · quick apply. */
const LeadRow = memo(function LeadRow({ lead, savedList }: { lead: FeedLead; savedList: boolean }) {
  return (
    <article className="panel flex gap-3 rounded-lg p-3">
      <div className="flex shrink-0 flex-col items-center self-start rounded-md bg-sunken px-1 py-1.5">
        <VoteRail targetType="lead" id={lead.id} upvotes={lead.upvotes} downvotes={lead.downvotes} userVote={lead.userVote} />
      </div>
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
          <span className={KIND_TAG[lead.kind]}>{LEAD_KIND_LABEL[lead.kind]}</span>
          <span className="tag">{lead.category}</span>
          {lead.isVerified && (
            <span className="tag tag-success">
              <ShieldCheck size={10} /> verified
            </span>
          )}
          <LeadEngagementBadge engagement={lead.engagement} />
          {savedList && !lead.acceptingBids && <span className="tag">Unavailable</span>}
          {lead.space && (
            <Link href={routes.space(lead.space.slug)} className="num hover:underline">
              b/{lead.space.slug}
            </Link>
          )}
          <span className="inline-flex items-center gap-1">
            <UserHoverCard username={lead.author.username}>
              <Link href={routes.profile(lead.author.username)} className="num font-medium text-ink-2 hover:underline">
                f/{lead.author.username}
              </Link>
            </UserHoverCard>
            {lead.author.isVerified && <VerifiedMark size={11} />}
          </span>
          <span aria-hidden="true">·</span>
          <time className="num" dateTime={lead.createdAt} suppressHydrationWarning>
            {timeAgo(lead.createdAt)}
          </time>
        </header>

        <h3 className="mt-1.5 break-words text-[16px] font-semibold leading-snug tracking-[-0.01em]">
          <Link href={lead.href} className="hover:underline">
            {lead.title}
          </Link>
        </h3>
        <MarkdownRenderer inline source={lead.excerpt} className="mt-1 line-clamp-2 block text-[13.5px] leading-relaxed text-ink-2" />

        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          <span className="num tag tag-verdigris text-[12px] normal-case tracking-normal">{formatBudget(lead.budgetMin, lead.budgetMax, lead.currency, lead.budgetUnit)}</span>
          {lead.budgetUnit !== "hourly" && <span>{leadBudgetUnitLabel(lead.budgetUnit)}</span>}
          <span className="inline-flex items-center gap-1">
            <MapPin size={11} /> {lead.location}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users size={11} /> <span className="num">{lead.bidCount}</span> bids
          </span>
        </div>

        {lead.skillTags.length > 0 && <ul aria-label="Skills" className="mt-2 flex flex-wrap gap-1">{lead.skillTags.map((skill) => <li key={skill} className="tag">{LEAD_SKILLS[skill] ?? skill}</li>)}</ul>}

        <footer className="-ml-1.5 mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-0.5">
            <LeadSaveButton leadId={lead.id} saved={lead.saved} />
            <ShareButton path={lead.href} />
            <ReportButton target={{ type: "lead", id: lead.id, label: lead.title, spaceId: lead.space?.id ?? null }} />
          </div>
          {lead.acceptingBids && <Link href={`${lead.href}#bid`} className="btn btn-primary btn-sm">Quick apply</Link>}
        </footer>
      </div>
    </article>
  );
});

type ResultsPage = CursorPage<FeedLead> & { total?: number };

export function LeadFeed({ initialPage, filters, viewerId, filterError, author }: {
  initialPage: LeadFeedPage | null;
  filters: LeadFilters;
  viewerId: number | null;
  filterError?: string;
  author?: string;
}) {
  const params = leadFiltersParams(filters);
  if (author) params.set("author", author);
  const query = params.toString();
  return (
    <section aria-label="Marketplace leads">
      <LeadFilterControls key={`controls:${filterError ?? query}`} filters={filters} filterError={filterError} author={author} />
      {!filterError && <LeadResults key={`results:${query}`} query={query} initialPage={initialPage} initialViewerId={viewerId} author={author} />}
    </section>
  );
}

export function SavedLeadFeed({ initialPage, viewerId }: { initialPage: CursorPage<FeedLead>; viewerId: number }) {
  return <section aria-label="Saved leads"><LeadResults initialPage={initialPage} initialViewerId={viewerId} savedList /></section>;
}

function LeadResults({ query = "", initialPage, initialViewerId, author, savedList = false }: {
  query?: string;
  initialPage: ResultsPage | null;
  initialViewerId: number | null;
  author?: string;
  savedList?: boolean;
}) {
  const viewerId = useSession()?.id ?? null;
  const sameViewer = viewerId === initialViewerId;
  const results = useInfiniteQuery({
    queryKey: savedList ? queryKeys.savedLeads(viewerId) : queryKeys.leads(viewerId, query),
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams(query);
      if (pageParam) params.set("cursor", pageParam);
      const endpoint = savedList ? "/api/me/saved-leads" : "/api/leads";
      return api<ResultsPage>(params.size ? `${endpoint}?${params}` : endpoint, { signal, cache: "no-store" });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialData: initialPage && sameViewer ? { pages: [initialPage], pageParams: [null] } : undefined,
    enabled: !savedList || (viewerId !== null && sameViewer),
    gcTime: 0, // Start from the URL's first page when a filter (or account) changes.
    ...(savedList && { staleTime: 0 }),
  });
  if (savedList && (!sameViewer || viewerId === null)) return null;
  const items = results.data?.pages.flatMap((page) => page.items) ?? [];
  const total = results.data?.pages[0]?.total;
  return (
    <>
      {total !== undefined && <p role="status" className="mb-2 px-1 text-[12px] text-ink-3"><span className="num">{total}</span> {total === 1 ? "lead" : "leads"}</p>}
      {results.isPending && <div aria-busy="true" className="space-y-3">{Array.from({ length: 3 }, (_, i) => <LeadRowSkeleton key={i} />)}</div>}
      {results.isError && (
        <div role="alert" className="panel mb-3 rounded-lg px-4 py-5 text-center text-[13px] text-ink-2">
          {results.error.message}{" "}
          <button type="button" className="btn btn-sm ml-2" onClick={() => void (results.isFetchNextPageError ? results.fetchNextPage() : results.refetch())}>Retry</button>
        </div>
      )}
      {results.isSuccess && items.length === 0 && (
        <div className="panel rounded-lg px-6 py-12 text-center">
          <p className="display text-[16px]">{savedList ? "No saved leads" : "No leads match these filters"}</p>
          <p className="mt-1 text-[13px] text-ink-3">{savedList ? "Save a public lead to find it here later." : author ? "Only public listings from this profile appear here." : "Try clearing a filter or check back for new leads."}</p>
          {savedList && <Link href={routes.leads()} className="btn btn-sm mt-3">Browse leads</Link>}
        </div>
      )}
      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((lead) => <li key={lead.id}><LeadRow lead={lead} savedList={savedList} /></li>)}
        </ul>
      )}
      {results.hasNextPage && (
        <div className="mt-3 text-center">
          <button className="btn" type="button" disabled={results.isFetching} onClick={() => void results.fetchNextPage()}>
            {results.isFetchingNextPage ? "Loading…" : savedList ? "Load more saved leads" : "Load more leads"}
          </button>
        </div>
      )}
    </>
  );
}
