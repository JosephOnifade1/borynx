"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Bell, Briefcase, CheckCheck, MessageSquare, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/primitives";
import { api, queryKeys } from "@/lib/client";
import type { NotificationWithActor } from "@/lib/notifications";
import { routes, timeAgo } from "@/lib/utils";

interface NotificationResponse {
  notifications: NotificationWithActor[];
  unreadCount: number;
}

const TYPE_ICONS = {
  comment_reply: MessageSquare,
  solution_accepted: Award,
  lead_bid: Briefcase,
  karma_milestone: Award,
  user_follow: UserPlus,
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const { data } = useQuery({
    queryKey: queryKeys.notifications(),
    queryFn: () => api<NotificationResponse>("/api/notifications?limit=10"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const unreadCount = data?.unreadCount ?? 0;
  const items = data?.notifications ?? [];

  const markAllReadMutation = useMutation({
    mutationFn: () => api<{ ok: boolean; unreadCount: number }>("/api/notifications/read", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications() });
    },
  });

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn btn-ghost relative h-8 w-8 justify-center px-0 text-ink-3 hover:text-ink"
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-ember px-1 text-[10px] font-bold text-white shadow-sm animate-in fade-in"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="panel-raised absolute right-0 mt-1.5 w-80 sm:w-96 rounded-lg p-0 shadow-xl overflow-hidden z-50">
          <header className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <span className="text-[13px] font-semibold text-ink">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="inline-flex items-center gap-1 text-[11.5px] text-ember hover:underline font-medium"
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </header>

          <div className="max-h-[380px] overflow-y-auto divide-y divide-line/60">
            {items.length === 0 ? (
              <div className="p-6 text-center text-[13px] text-ink-3">
                You're all caught up! No notifications yet.
              </div>
            ) : (
              items.map((n) => {
                const Icon = TYPE_ICONS[n.type] ?? Bell;
                return (
                  <Link
                    key={n.id}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-start gap-3 p-3 transition-colors hover:bg-sunken ${
                      !n.isRead ? "bg-ember-soft/10" : ""
                    }`}
                  >
                    {n.actor ? (
                      <Avatar hue={n.actor.avatarHue} name={n.actor.displayName} size={30} />
                    ) : (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-3">
                        <Icon size={14} />
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] leading-snug text-ink-2 font-normal line-clamp-2">
                        {n.message}
                      </p>
                      <span className="num mt-1 block text-[10.5px] text-ink-3">
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>

                    {!n.isRead && (
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ember"
                      />
                    )}
                  </Link>
                );
              })
            )}
          </div>

          <footer className="border-t border-line bg-sunken/50 p-2 text-center">
            <Link
              href={routes.notifications()}
              onClick={() => setOpen(false)}
              className="text-[12px] font-medium text-ink-2 hover:text-ink hover:underline"
            >
              Open notifications inbox →
            </Link>
          </footer>
        </div>
      )}
    </div>
  );
}
