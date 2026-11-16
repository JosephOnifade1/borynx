"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, queryKeys } from "@/lib/client";
import type { HoverCardUser } from "@/lib/types";
import { formatCompact, routes, timeAgo } from "@/lib/utils";
import { Avatar, BadgeChip, VerifiedMark } from "./primitives";
import { FollowButton } from "./FollowButton";

interface Props {
  username: string;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps a user reference. On desktop (hover-capable pointer) a card fetches live stats after a
 * short intent delay. Touch devices simply navigate.
 */
export const UserHoverCard = memo(function UserHoverCard({ username, children, className }: Props) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);
  const canHover = useRef(false);

  useEffect(() => {
    canHover.current = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }, []);

  const show = useCallback(() => {
    if (!canHover.current) return;
    setArmed(true);
    timer.current = window.setTimeout(() => setOpen(true), 220);
  }, []);
  const hide = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 120);
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.user(username),
    queryFn: () => api<HoverCardUser>(`/api/users/${encodeURIComponent(username)}`),
    enabled: armed,
    staleTime: 60_000,
  });

  return (
    <span className={className} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} style={{ position: "relative", display: "inline-block" }}>
      {children}
      {open && (
        <span role="tooltip" className="panel-raised absolute left-0 top-full z-[60] mt-1.5 block w-72 rounded-md p-3 text-left font-normal normal-case tracking-normal" onMouseEnter={show} onMouseLeave={hide}>
          {isLoading && (
            <span className="block">
              <span className="flex items-center gap-2.5">
                <span className="skeleton h-9 w-9 rounded-[6px]" />
                <span className="flex-1">
                  <span className="skeleton block h-3.5 w-28" />
                  <span className="skeleton mt-1.5 block h-3 w-40" />
                </span>
              </span>
              <span className="skeleton mt-3 block h-3 w-full" />
            </span>
          )}
          {isError && <span className="block text-[12.5px] text-ink-3">No profile at f/{username}.</span>}
          {data && <HoverBody user={data} />}
        </span>
      )}
    </span>
  );
});

function HoverBody({ user }: { user: HoverCardUser }) {
  return (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="flex items-start gap-2.5 min-w-0">
          <Avatar hue={user.avatarHue} name={user.displayName} size={36} />
          <span className="min-w-0 flex-1">
            <Link href={routes.profile(user.username)} className="flex items-center gap-1 text-[13.5px] font-semibold text-ink hover:underline">
              <span className="truncate">{user.displayName}</span>
              {user.isVerified && <VerifiedMark size={13} />}
            </Link>
            <span className="num block text-[11px] text-ink-3">f/{user.username}</span>
          </span>
        </span>
        <FollowButton
          username={user.username}
          initialFollowing={user.isFollowing}
          initialFollowerCount={user.followerCount}
          size="sm"
        />
      </span>
      {user.headline && <span className="mt-2 block text-[12px] leading-snug text-ink-2">{user.headline}</span>}
      <span className="num mt-2.5 grid grid-cols-4 gap-1 text-center">
        <Stat label="karma" value={formatCompact(user.karma)} />
        <Stat label="followers" value={formatCompact(user.followerCount ?? 0)} />
        <Stat label="threads" value={String(user.postCount)} />
        <Stat label="solved" value={String(user.solutionCount)} />
      </span>
      {user.badges.length > 0 && (
        <span className="mt-2.5 flex flex-wrap gap-1">
          {user.badges.map((b) => (
            <BadgeChip key={b.slug} icon={b.icon} name={b.name} tier={b.tier} />
          ))}
        </span>
      )}
      {user.skills.length > 0 && <span className="mt-2 block text-[11.5px] text-ink-3">{user.skills.slice(0, 4).join(" · ")}</span>}
      <span className="mt-2 block text-[10.5px] text-ink-4">
        joined {timeAgo(user.createdAt)} ago{user.isBanned ? " · restricted" : ""}
      </span>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="block rounded bg-sunken px-1 py-1">
      <span className="block text-[13px] font-semibold text-ink">{value}</span>
      <span className="block text-[9.5px] uppercase tracking-wider text-ink-3">{label}</span>
    </span>
  );
}
