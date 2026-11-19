"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Bell, Briefcase, CheckCheck, Handshake, MessageSquare, Trophy, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/primitives";
import { api, queryKeys } from "@/lib/client";
import type { NotificationWithActor } from "@/lib/notifications";
import { cn, timeAgo } from "@/lib/utils";

interface NotificationResponse {
  notifications: NotificationWithActor[];
  unreadCount: number;
}

const TYPE_ICONS = {
  comment_reply: MessageSquare,
  solution_accepted: Award,
  lead_bid: Briefcase,
  lead_bid_accepted: Trophy,
  lead_kickoff: Handshake,
  lead_review_decision: Briefcase,
  karma_milestone: Award,
  user_follow: UserPlus,
};

const TYPE_TAGS = {
  comment_reply: { label: "Reply", className: "tag" },
  solution_accepted: { label: "Solution", className: "tag tag-gold" },
  lead_bid: { label: "Lead Pitch", className: "tag tag-verdigris" },
  lead_bid_accepted: { label: "Lead Award", className: "tag tag-gold" },
  lead_kickoff: { label: "Kickoff", className: "tag tag-verdigris" },
  lead_review_decision: { label: "Lead Review", className: "tag tag-gold" },
  karma_milestone: { label: "Milestone", className: "tag tag-gold" },
  user_follow: { label: "Follower", className: "tag tag-ember" },
};

export function NotificationsInbox({
  initialData,
}: {
  initialData: NotificationResponse;
}) {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: queryKeys.notifications(),
    queryFn: () => api<NotificationResponse>("/api/notifications?limit=60"),
    initialData,
    staleTime: 10_000,
  });

  const markAllMutation = useMutation({
    mutationFn: () => api<{ ok: boolean }>("/api/notifications/read", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications() });
    },
  });

  const markSingleMutation = useMutation({
    mutationFn: (id: number) =>
      api<{ ok: boolean }>("/api/notifications/read", { method: "POST", json: { ids: [id] } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications() });
    },
  });

  const allItems = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const items = filter === "unread" ? allItems.filter((n) => !n.isRead) : allItems;

  return (
    <div>
      <div className="panel mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg p-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "btn h-8 px-3 text-[12.5px] font-medium",
              filter === "all" ? "border-ink-3 bg-sunken text-ink" : "btn-ghost text-ink-3",
            )}
          >
            All <span className="num text-[11px] text-ink-3">({allItems.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter("unread")}
            className={cn(
              "btn h-8 px-3 text-[12.5px] font-medium",
              filter === "unread" ? "border-ink-3 bg-sunken text-ink" : "btn-ghost text-ink-3",
            )}
          >
            Unread
            {unreadCount > 0 && (
              <span className="ml-1 rounded-full bg-ember px-1.5 py-0.2 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending}
            className="btn btn-ghost h-8 gap-1.5 text-[12.5px] text-ember hover:text-ember"
          >
            <CheckCheck size={14} /> Mark all read
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="panel rounded-lg p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sunken text-ink-3">
            <Bell size={24} />
          </div>
          <h2 className="mt-4 text-[16px] font-semibold text-ink">
            {filter === "unread" ? "No unread notifications" : "Inbox is empty"}
          </h2>
          <p className="mt-1.5 max-w-sm mx-auto text-[13px] text-ink-3">
            {filter === "unread"
              ? "All caught up! Check the 'All' tab to review previous updates."
              : "When members reply to your threads, submit pitches on your leads, or follow you, they'll show up here."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const Icon = TYPE_ICONS[n.type] ?? Bell;
            const tag = TYPE_TAGS[n.type] ?? { label: "Notice", className: "tag" };
            return (
              <div
                key={n.id}
                className={cn(
                  "panel relative flex items-start gap-3.5 rounded-lg p-3.5 transition-colors",
                  !n.isRead && "border-ember/40 bg-ember-soft/5",
                )}
              >
                {n.actor ? (
                  <Avatar hue={n.actor.avatarHue} name={n.actor.displayName} size={38} className="mt-0.5" />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-3 mt-0.5">
                    <Icon size={16} />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={tag.className}>{tag.label}</span>
                    <time dateTime={String(n.createdAt)} className="num text-[11.5px] text-ink-3">
                      {timeAgo(n.createdAt)}
                    </time>
                    {!n.isRead && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ember">
                        ● new
                      </span>
                    )}
                  </div>

                  <Link
                    href={n.href}
                    prefetch={n.type === "lead_kickoff" || n.type === "lead_bid_accepted" ? false : undefined}
                    onClick={() => {
                      if (!n.isRead) markSingleMutation.mutate(n.id);
                    }}
                    className="block text-[14px] leading-snug text-ink font-medium hover:text-ember transition-colors"
                  >
                    {n.message}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
