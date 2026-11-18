"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { CheckCircle2, CornerDownRight, Reply } from "lucide-react";
import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { MarkdownToolbar } from "@/components/MarkdownToolbar";
import { useSession } from "@/components/providers";
import { Avatar, VerifiedMark } from "@/components/primitives";
import { ReportButton } from "@/components/shell/ReportModal";
import { UserHoverCard } from "@/components/UserHoverCard";
import { api, ClientError, queryKeys } from "@/lib/client";
import type { CommentNode } from "@/lib/types";
import { cn, routes, timeAgo } from "@/lib/utils";
import { useUiStore } from "@/store/ui";
import { ShareButton, VoteRail } from "../feed/controls";

interface Props {
  postId: number;
  postAuthorId: number | null;
  postHref: string;
  spaceId: number;
  canModerate: boolean;
  locked?: boolean;
  initialCount: number;
  initialComments?: CommentNode[];
}

/* ---------------- Composer ---------------- */

function Composer({ postId, parentId, onDone, autoFocus }: { postId: number; parentId: number | null; onDone: () => void; autoFocus?: boolean }) {
  const user = useSession();
  const notify = useUiStore((s) => s.notify);
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mutation = useMutation({
    mutationFn: () => api<{ id: number; newBadges: string[]; flagged: boolean }>(`/api/posts/${postId}/comments`, { method: "POST", json: { body, parentId } }),
    onSuccess: (res) => {
      setBody("");
      setPreview(false);
      void qc.invalidateQueries({ queryKey: queryKeys.comments(postId) });
      notify(res.flagged ? "Posted — flagged for review by the auto-filter" : "Comment posted", res.flagged ? "info" : "success");
      res.newBadges.forEach((b) => notify(`Badge unlocked: ${b}`, "success"));
      onDone();
    },
    onError: (e) => notify(e instanceof ClientError ? e.message : "Could not post", "error"),
  });

  if (!user) {
    return (
      <div className="rounded-md border border-dashed border-line-strong px-4 py-3 text-[13px] text-ink-2">
        <Link href={routes.login()} className="font-semibold text-ember hover:underline">
          Sign in
        </Link>{" "}
        to join the thread.
      </div>
    );
  }
  if (user.isBanned) {
    return <div className="rounded-md border border-danger/40 bg-danger-soft/40 px-4 py-3 text-[13px] text-danger">Your account is restricted. You can read but not post.</div>;
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim().length >= 2) mutation.mutate();
      }}
      className="flex gap-3"
    >
      <Avatar hue={user.avatarHue} name={user.displayName} size={30} className="mt-0.5 hidden sm:inline-flex" />
      <div className="flex-1">
        <div className="overflow-hidden rounded-md border border-line bg-surface focus-within:border-ink-3">
          <MarkdownToolbar
            textareaRef={textareaRef}
            value={body}
            onChange={setBody}
            isPreview={preview}
            onTogglePreview={() => setPreview((p) => !p)}
          />

          {preview ? (
            <div className="min-h-[100px] p-3 text-[13px] leading-relaxed">
              <MarkdownRenderer source={body || "*Nothing to preview yet.*"} />
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={parentId ? 3 : 4}
              autoFocus={autoFocus}
              className="field w-full border-0 bg-transparent rounded-none focus:ring-0"
              placeholder={parentId ? "Write a reply… (markdown, b/space and f/user links work)" : "Add to the thread… (markdown, b/space and f/user links work)"}
              aria-label={parentId ? "Reply" : "New comment"}
            />
          )}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="num text-[10.5px] text-ink-4">{body.length}/8000</span>
          <div className="flex gap-2">
            {parentId && (
              <button type="button" className="btn btn-sm" onClick={onDone}>
                Cancel
              </button>
            )}
            <button type="submit" className="btn btn-primary btn-sm" disabled={mutation.isPending || body.trim().length < 2}>
              {mutation.isPending ? "Posting…" : parentId ? "Reply" : "Comment"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

/* ---------------- Row ---------------- */

const CommentRow = memo(function CommentRow({ node, canAccept, locked, postId, postHref, spaceId, replyingTo, setReplyingTo }: { node: CommentNode; canAccept: boolean; locked: boolean; postId: number; postHref: string; spaceId: number; replyingTo: number | null; setReplyingTo: (id: number | null) => void }) {
  const qc = useQueryClient();
  const notify = useUiStore((s) => s.notify);
  const accept = useMutation({
    mutationFn: () => api<{ isSolution: boolean }>(`/api/comments/${node.id}/solution`, { method: "POST" }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: queryKeys.comments(postId) });
      notify(r.isSolution ? "Marked as solution — author awarded 10× karma" : "Solution unmarked", "success");
    },
    onError: (e) => notify(e instanceof ClientError ? e.message : "Failed", "error"),
  });

  return (
    <div className={cn("py-3", node.depth > 0 && "border-l border-line")} style={{ marginLeft: Math.min(node.depth, 6) * 20, paddingLeft: node.depth > 0 ? 14 : 0 }}>
      <div className={cn("rounded-md", node.isSolution && "border border-success/40 bg-success-soft/30 p-3")}>
        <div className="flex items-center gap-2 text-[11.5px] text-ink-3">
          {node.depth > 0 && <CornerDownRight size={11} className="text-ink-4" />}
          <Avatar hue={node.author.avatarHue} name={node.author.displayName} size={18} />
          <UserHoverCard username={node.author.username}>
            <Link href={routes.profile(node.author.username)} className="num font-medium text-ink hover:underline">
              f/{node.author.username}
            </Link>
          </UserHoverCard>
          {node.author.isVerified && <VerifiedMark size={11} />}
          <span className="num">{node.author.karma.toLocaleString("en-US")}</span>
          <span aria-hidden="true">·</span>
          <time className="num" dateTime={node.createdAt} suppressHydrationWarning>
            {timeAgo(node.createdAt)}
          </time>
          {node.isSolution && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-success">
              <CheckCircle2 size={13} /> Accepted solution
            </span>
          )}
        </div>
        <div className={cn("mt-1.5", node.isRemoved && "italic text-ink-4")}>
          <MarkdownRenderer source={node.body} className="text-[14px]" />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {!locked && (
            <>
              <VoteRail targetType="comment" id={node.id} upvotes={node.upvotes} downvotes={node.downvotes} userVote={node.userVote} orientation="horizontal" size="sm" />
              <button type="button" className="btn btn-ghost btn-sm text-ink-3" onClick={() => setReplyingTo(replyingTo === node.id ? null : node.id)}>
                <Reply size={12} /> Reply
              </button>
            </>
          )}
          {canAccept && !node.isRemoved && (
            <button type="button" className={cn("btn btn-ghost btn-sm", node.isSolution ? "text-success" : "text-ink-3")} onClick={() => accept.mutate()} disabled={accept.isPending}>
              <CheckCircle2 size={12} /> {node.isSolution ? "Unmark solution" : "Mark as solution"}
            </button>
          )}
          <ShareButton path={`${postHref}#c-${node.id}`} />
          <ReportButton target={{ type: "comment", id: node.id, label: node.body, spaceId }} />
        </div>
        {!locked && replyingTo === node.id && (
          <div className="mt-3">
            <Composer postId={postId} parentId={node.id} onDone={() => setReplyingTo(null)} autoFocus />
          </div>
        )}
      </div>
    </div>
  );
});

/* ---------------- Thread ---------------- */

export function CommentThread({ postId, postAuthorId, postHref, spaceId, canModerate, locked = false, initialCount, initialComments }: Props) {
  const user = useSession();
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.comments(postId),
    queryFn: () => api<{ items: CommentNode[] }>(`/api/posts/${postId}/comments`),
    initialData: initialComments ? { items: initialComments } : undefined,
  });
  const items = useMemo(() => data?.items ?? [], [data]);
  const canAccept = Boolean(!locked && user && (user.id === postAuthorId || canModerate));

  const virtualizer = useWindowVirtualizer({ count: items.length, estimateSize: () => 140, overscan: 10, scrollMargin: listRef.current?.offsetTop ?? 0, initialRect: { width: 1024, height: 900 }, initialOffset: 0 });
  const setReply = useCallback((id: number | null) => setReplyingTo(id), []);

  useEffect(() => {
    // Deep-link #c-<id> support once the thread renders.
    const hash = window.location.hash;
    const m = /^#c-(\d+)$/.exec(hash);
    if (!m || items.length === 0) return;
    const idx = items.findIndex((c) => c.id === Number(m[1]));
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "center" });
  }, [items, virtualizer]);

  return (
    <section aria-label="Comments" className="px-4 py-5 sm:px-6">
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="display text-[16px]">
          {items.length || initialCount} <span className="text-ink-3">comments</span>
        </h2>
        <span className="eyebrow">solutions first · then score</span>
      </header>
      {!locked && <Composer postId={postId} parentId={null} onDone={() => undefined} />}

      <div className="mt-6">
        {isPending && (
          <div aria-busy="true" className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="skeleton h-5 w-5 rounded" />
                <div className="flex-1">
                  <div className="skeleton h-3 w-32" />
                  <div className="skeleton mt-2 h-3 w-full" />
                  <div className="skeleton mt-1 h-3 w-[70%]" />
                </div>
              </div>
            ))}
          </div>
        )}
        {isError && (
          <p className="text-[13px] text-danger">
            Couldn&apos;t load comments.{" "}
            <button type="button" className="underline" onClick={() => refetch()}>
              Retry
            </button>
          </p>
        )}
        {!locked && data && items.length === 0 && <p className="py-6 text-center text-[13px] text-ink-3">No comments yet. The first reply often becomes the accepted solution.</p>}
        {items.length > 0 && (
          <div ref={listRef} style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const node = items[vi.index];
              return (
                <div key={node.id} id={`c-${node.id}`} data-index={vi.index} ref={virtualizer.measureElement} className="absolute left-0 top-0 w-full" style={{ transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)` }}>
                  <CommentRow node={node} canAccept={canAccept} locked={locked} postId={postId} postHref={postHref} spaceId={spaceId} replyingTo={replyingTo} setReplyingTo={setReply} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
