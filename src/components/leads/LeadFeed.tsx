"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { MapPin, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { memo, useEffect, useMemo, useState } from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { LeadRowSkeleton, VerifiedMark } from "@/components/primitives";
import { ReportButton } from "@/components/shell/ReportModal";
import { UserHoverCard } from "@/components/UserHoverCard";
import { useWindowScrollMargin } from "@/components/useWindowScrollMargin";
import { api, queryKeys } from "@/lib/client";
import { LEAD_CATEGORIES, LEAD_KIND_LABEL, leadBudgetUnitLabel } from "@/lib/constants";
import { LEAD_SKILLS } from "@/lib/lead-input";
import { RANK_MODES, type RankMode } from "@/lib/sorting";
import type { FeedLead, FeedPage } from "@/lib/types";
import { cn, formatBudget, routes, timeAgo } from "@/lib/utils";
import { ShareButton, SortSelector, VoteRail } from "../feed/controls";
import { LeadEngagementBadge } from "./LeadEngagementBadge";

const KIND_TAG: Record<FeedLead["kind"], string> = { bounty: "tag tag-ember", contract: "tag tag-verdigris", job: "tag tag-gold" };

/** Marketplace job card: vote pill · type/category/trust badges · title · inline budget · quick apply. */
export const LeadRow = memo(function LeadRow({ lead }: { lead: FeedLead }) {
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

        <h3 className="mt-1.5 text-[16px] font-semibold leading-snug tracking-[-0.01em]">
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
          <div className="flex items-center gap-0.5">
            <ShareButton path={lead.href} />
            <ReportButton target={{ type: "lead", id: lead.id, label: lead.title, spaceId: lead.space?.id ?? null }} />
          </div>
          {lead.acceptingBids && <Link href={`${lead.href}#bid`} className="btn btn-primary btn-sm">Quick apply</Link>}
        </footer>
      </div>
    </article>
  );
});

const LEAD_MODES = RANK_MODES.map((m) => (m.id === "new" ? { ...m, label: "Fresh" } : m));

export function LeadFeed({ initialPage, author }: { initialPage?: FeedPage<FeedLead>; author?: string } = {}) {
  const [mode, setMode] = useState<RankMode>("new");
  const [category, setCategory] = useState<string>("");
  const [kind, setKind] = useState<string>("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const { listRef, scrollMargin } = useWindowScrollMargin();

  const params = useMemo(
    () => ({ sort: mode, category: category || undefined, kind: kind || undefined, verified: verifiedOnly ? "1" : undefined, author }),
    [mode, category, kind, verifiedOnly, author],
  );
  const query = useInfiniteQuery({
    queryKey: queryKeys.leads(params),
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ sort: mode, cursor: String(pageParam) });
      if (category) qs.set("category", category);
      if (kind) qs.set("kind", kind);
      if (verifiedOnly) qs.set("verified", "1");
      if (author) { qs.set("author", author); qs.set("active", "1"); }
      return api<FeedPage<FeedLead>>(`/api/leads?${qs.toString()}`);
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialData: initialPage && mode === initialPage.mode && !category && !kind && !verifiedOnly ? { pages: [initialPage], pageParams: [0] } : undefined,
  });
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  const virtualizer = useWindowVirtualizer({
    count: items.length + (query.hasNextPage ? 1 : 0),
    estimateSize: () => 190,
    overscan: 6,
    scrollMargin,
    initialRect: { width: 680, height: 900 },
    initialOffset: 0,
  });
  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (last && last.index >= items.length - 1 && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  }, [virtualItems, items.length, query]);

  return (
    <section aria-label="Marketplace leads">
      <div className="panel mb-3 flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5">
        <SortSelector value={mode} onChange={setMode} modes={LEAD_MODES} />
        <div className="ml-auto flex items-center gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="field h-7 w-auto text-[12.5px]" aria-label="Lead type">
            <option value="">All types</option>
            <option value="bounty">Bounties</option>
            <option value="contract">Contracts</option>
            <option value="job">Roles</option>
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="field h-7 w-auto text-[12.5px]" aria-label="Category">
            <option value="">All disciplines</option>
            {LEAD_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className={cn("inline-flex cursor-pointer items-center gap-2 pr-1 text-[12.5px] text-ink-2")}>
            <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="accent-[var(--ember)]" />
            Verified only
          </label>
        </div>
      </div>

      {query.isPending && (
        <div aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="pb-3">
              <LeadRowSkeleton />
            </div>
          ))}
        </div>
      )}
      {query.isError && (
        <div className="panel rounded-lg px-4 py-10 text-center text-[13px] text-ink-2">
          {query.error.message}{" "}
          <button type="button" className="btn btn-sm ml-2" onClick={() => query.refetch()}>
            Retry
          </button>
        </div>
      )}
      {query.isSuccess && items.length === 0 && (
        <div className="panel rounded-lg px-6 py-14 text-center">
          <p className="display text-[16px]">No leads match these filters</p>
          <p className="mt-1 text-[13px] text-ink-3">Loosen a filter or post the first one.</p>
        </div>
      )}
      {items.length > 0 && (
        <div ref={listRef} role="feed" style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualItems.map((vi) => {
            const isLoader = vi.index >= items.length;
            return (
              <div key={isLoader ? "loader" : items[vi.index].id} data-index={vi.index} ref={virtualizer.measureElement} className="absolute left-0 top-0 w-full pb-3" style={{ transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)` }}>
                {isLoader ? <LeadRowSkeleton /> : <LeadRow lead={items[vi.index]} />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
