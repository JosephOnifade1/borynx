"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { CheckCircle2, ExternalLink, MessageSquare, Pin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { FeedSkeleton, PostRowSkeleton, VerifiedMark } from "@/components/primitives";
import { ReportButton } from "@/components/shell/ReportModal";
import { UserHoverCard } from "@/components/UserHoverCard";
import { useWindowScrollMargin } from "@/components/useWindowScrollMargin";
import { api, queryKeys } from "@/lib/client";
import { POST_KIND_LABEL } from "@/lib/constants";
import type { RankMode } from "@/lib/sorting";
import type { FeedPage, FeedPost } from "@/lib/types";
import { cn, routes, timeAgo } from "@/lib/utils";
import { CreatePostBox } from "./CreatePostBox";
import { SaveButton, ShareButton, SortSelector, VoteRail } from "./controls";

const KIND_TAG: Record<FeedPost["kind"], string> = {
  discussion: "tag",
  resource: "tag tag-verdigris",
  help: "tag tag-ember",
  showcase: "tag tag-gold",
};

/** Link preview chip: host + path of the first external URL in the post. */
function LinkPreview({ href }: { href: string }) {
  let host = href;
  let path = "";
  try {
    const u = new URL(href);
    host = u.host;
    path = u.pathname === "/" ? "" : u.pathname;
  } catch {
    /* keep raw value */
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className="mt-2.5 flex min-w-0 items-center gap-2 rounded-md border border-line bg-sunken px-3 py-2 text-[12px] transition-colors hover:border-line-strong"
    >
      <ExternalLink size={12} className="shrink-0 text-ink-3" aria-hidden="true" />
      <span className="num truncate font-medium text-verdigris">{host}</span>
      <span className="num truncate text-ink-3">{path}</span>
    </a>
  );
}

/* ---------------- Post card ---------------- */

/**
 * Reddit / Threads card:
 *  ┌────┬──────────────────────────────────────────┐
 *  │ ▲  │ b/space · f/author ✓ · 3h · kind          │
 *  │ 12 │ Title                                     │
 *  │ ▼  │ body with auto-linked b/ and f/ refs      │
 *  │    │ [link preview]                            │
 *  │    │ 💬 14  ↗ share  🔖 save  ⚑ report          │
 *  └────┴──────────────────────────────────────────┘
 */
export const PostRow = memo(function PostRow({ post, focused, showSpace, index }: { post: FeedPost; focused: boolean; showSpace: boolean; index: number }) {
  return (
    <article className={cn("panel flex gap-3 rounded-lg p-3 transition-shadow", focused && "shadow-[inset_0_0_0_2px_var(--ember)]")} data-focused={focused} aria-posinset={index + 1}>
      <div className="flex shrink-0 flex-col items-center self-start rounded-md bg-sunken px-1 py-1.5">
        <VoteRail targetType="post" id={post.id} upvotes={post.upvotes} downvotes={post.downvotes} userVote={post.userVote} />
      </div>

      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
          {showSpace && (
            <Link href={routes.space(post.space.slug)} className="tag hover:border-ink-3">
              <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: `hsl(${post.space.accentHue} 60% 48%)` }} aria-hidden="true" />
              <span className="num normal-case tracking-normal">b/{post.space.slug}</span>
            </Link>
          )}
          <span className="inline-flex items-center gap-1">
            <UserHoverCard username={post.author.username}>
              <Link href={routes.profile(post.author.username)} className="num font-medium text-ink-2 hover:underline">
                f/{post.author.username}
              </Link>
            </UserHoverCard>
            {post.author.isVerified && <VerifiedMark size={11} />}
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={post.createdAt} className="num" suppressHydrationWarning>
            {timeAgo(post.createdAt)}
          </time>
          <span className={KIND_TAG[post.kind]}>{POST_KIND_LABEL[post.kind]}</span>
          {post.isPinned && (
            <span className="inline-flex items-center gap-1 text-gold">
              <Pin size={11} /> pinned
            </span>
          )}
        </header>

        <h3 className="mt-1.5 text-[16px] font-semibold leading-snug tracking-[-0.01em]">
          <Link href={post.href} className="hover:underline focus-visible:underline">
            {post.title}
          </Link>
          {post.isSolved && (
            <span className="ml-2 inline-flex items-center gap-1 align-middle text-[11px] font-medium text-success">
              <CheckCircle2 size={13} /> solved
            </span>
          )}
        </h3>

        {post.excerpt && <MarkdownRenderer inline source={post.excerpt} className="mt-1 line-clamp-3 block text-[13.5px] leading-relaxed text-ink-2" />}
        {post.primaryLink && <LinkPreview href={post.primaryLink} />}

        <footer className="-ml-1.5 mt-2 flex flex-wrap items-center gap-0.5">
          <Link href={post.href} className="btn btn-ghost btn-sm text-ink-3" aria-label={`${post.commentCount} comments`}>
            <MessageSquare size={13} /> <span className="num">{post.commentCount}</span>
          </Link>
          <ShareButton path={post.href} label="Share" />
          <SaveButton postId={post.id} saved={post.saved} />
          <ReportButton target={{ type: "post", id: post.id, label: post.title, spaceId: post.space.id }} />
        </footer>
      </div>
    </article>
  );
});

/* ---------------- Feed ---------------- */

export interface PostFeedProps {
  space?: string;
  author?: string;
  saved?: boolean;
  solved?: boolean;
  following?: boolean;
  initialMode?: RankMode;
  showSpace?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  hideControls?: boolean;
  /** Renders the creator box above the sort tabs. */
  composer?: boolean;
  /** First page rendered on the server — the feed is visible before any client fetch. */
  initialPage?: FeedPage<FeedPost>;
}

const isTypingTarget = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

export function PostFeed({
  space,
  author,
  saved,
  solved,
  following,
  initialMode = "hot",
  showSpace = true,
  emptyTitle = "Nothing here yet",
  emptyHint = "Be the first to start a thread.",
  hideControls,
  composer,
  initialPage,
}: PostFeedProps) {
  const router = useRouter();
  const [mode, setMode] = useState<RankMode>(initialMode);
  const [focusIndex, setFocusIndex] = useState(-1);
  const { listRef, scrollMargin } = useWindowScrollMargin();

  const params = useMemo(
    () => ({
      sort: mode,
      space,
      author,
      saved: saved ? "1" : undefined,
      solved: solved ? "1" : undefined,
      following: following ? "1" : undefined,
    }),
    [mode, space, author, saved, solved, following],
  );

  const query = useInfiniteQuery({
    queryKey: queryKeys.posts(params),
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ sort: mode, cursor: String(pageParam) });
      if (space) qs.set("space", space);
      if (author) qs.set("author", author);
      if (saved) qs.set("saved", "1");
      if (solved) qs.set("solved", "1");
      if (following) qs.set("following", "1");
      return api<FeedPage<FeedPost>>(`/api/posts?${qs.toString()}`);
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialData: initialPage && initialPage.mode === mode ? { pages: [initialPage], pageParams: [0] } : undefined,
  });

  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;

  const virtualizer = useWindowVirtualizer({
    count: items.length + (query.hasNextPage ? 1 : 0),
    estimateSize: () => 170,
    overscan: 8,
    scrollMargin,
    initialRect: { width: 680, height: 900 },
    initialOffset: 0,
  });

  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (!last) return;
    if (last.index >= items.length - 1 && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  }, [virtualItems, items.length, query]);

  const changeMode = useCallback((m: RankMode) => {
    setMode(m);
    setFocusIndex(-1);
    const url = new URL(window.location.href);
    url.searchParams.set("sort", m);
    window.history.replaceState(null, "", url.toString());
  }, []);

  // J / K / Enter keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (items.length === 0) return;
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && focusIndex >= 0) {
        router.push(items[focusIndex].href);
      } else if (e.key === "Escape") {
        setFocusIndex(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, focusIndex, router]);

  useEffect(() => {
    if (focusIndex >= 0) virtualizer.scrollToIndex(focusIndex, { align: "auto" });
  }, [focusIndex, virtualizer]);

  return (
    <section aria-label="Thread feed">
      {composer && <CreatePostBox spaceSlug={space} />}

      {!hideControls && (
        <div className="panel mb-3 flex items-center justify-between gap-2 rounded-lg px-2">
          <SortSelector value={mode} onChange={changeMode} />
          <span className="num pr-2 text-[11px] text-ink-3">{query.isPending ? "ranking…" : `${total} threads`}</span>
        </div>
      )}

      {query.isPending && <FeedSkeleton />}

      {query.isError && (
        <div className="panel rounded-lg px-4 py-10 text-center">
          <p className="eyebrow text-danger">Feed unavailable</p>
          <p className="mt-1 text-[13px] text-ink-2">{query.error.message}</p>
          <button type="button" className="btn btn-sm mt-3" onClick={() => query.refetch()}>
            Retry
          </button>
        </div>
      )}

      {query.isSuccess && items.length === 0 && (
        <div className="panel rounded-lg px-6 py-14 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-md border border-dashed border-line-strong" aria-hidden="true" />
          <p className="display text-[16px]">{emptyTitle}</p>
          <p className="mt-1 text-[13px] text-ink-3">{emptyHint}</p>
        </div>
      )}

      {items.length > 0 && (
        <div ref={listRef} role="feed" aria-busy={query.isFetchingNextPage} style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualItems.map((vi) => {
            const isLoader = vi.index >= items.length;
            const post = items[vi.index];
            return (
              <div
                key={isLoader ? "loader" : post.id}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full pb-3"
                style={{ transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)` }}
              >
                {isLoader ? <PostRowSkeleton /> : <PostRow post={post} focused={focusIndex === vi.index} showSpace={showSpace} index={vi.index} />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
