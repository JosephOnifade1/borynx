"use client";

import { useQuery } from "@tanstack/react-query";
import { Award, CheckCircle2, ShieldCheck, Sparkles, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FollowButton } from "@/components/FollowButton";
import { Avatar, VerifiedMark } from "@/components/primitives";
import { UserHoverCard } from "@/components/UserHoverCard";
import { api, queryKeys } from "@/lib/client";
import type { PublicUser } from "@/lib/auth";
import { cn, formatCompact, routes } from "@/lib/utils";

export interface LeaderboardUser extends PublicUser {
  solutionCount: number;
  followerCount: number;
  isFollowing?: boolean;
  rank: number;
}

const DISCIPLINES = [
  "All",
  "Engineering",
  "Design",
  "DevOps",
  "Data",
  "AI",
  "Security",
  "Product",
];

const SORTS = [
  { id: "karma", label: "Top Karma", icon: Sparkles },
  { id: "solutions", label: "Most Solved", icon: Award },
  { id: "followers", label: "Most Followed", icon: Users },
  { id: "recent", label: "Newest", icon: CheckCircle2 },
] as const;

export function LeaderboardView({
  initialItems,
}: {
  initialItems: LeaderboardUser[];
}) {
  const [sort, setSort] = useState<"karma" | "solutions" | "followers" | "recent">("karma");
  const [discipline, setDiscipline] = useState("All");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const queryParams = {
    sort,
    skill: discipline === "All" ? undefined : discipline,
    verified: verifiedOnly ? "1" : undefined,
  };

  const { data, isPending } = useQuery({
    queryKey: queryKeys.leaderboard(queryParams),
    queryFn: () => {
      const sp = new URLSearchParams({ sort });
      if (discipline !== "All") sp.set("skill", discipline);
      if (verifiedOnly) sp.set("verified", "1");
      return api<{ items: LeaderboardUser[] }>(`/api/leaderboard?${sp.toString()}`);
    },
    initialData:
      sort === "karma" && discipline === "All" && !verifiedOnly
        ? { items: initialItems }
        : undefined,
  });

  const items = data?.items ?? initialItems;

  return (
    <div className="space-y-4">
      {/* Controls panel */}
      <div className="panel space-y-3 rounded-lg p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div className="flex flex-wrap items-center gap-1">
            {SORTS.map((s) => {
              const active = sort === s.id;
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSort(s.id)}
                  className={cn(
                    "btn h-8 gap-1.5 px-3 text-[12.5px] font-medium transition-colors",
                    active ? "border-ink-3 bg-sunken text-ink" : "btn-ghost text-ink-3",
                  )}
                >
                  <Icon size={13} className={active ? "text-ember" : "text-ink-3"} />
                  {s.label}
                </button>
              );
            })}
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-2">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
              className="accent-[var(--ember)]"
            />
            <ShieldCheck size={13} className="text-verdigris" />
            Verified Pros only
          </label>
        </div>

        {/* Discipline pill selector */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow mr-1 text-ink-3">Discipline:</span>
          {DISCIPLINES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDiscipline(d)}
              className={cn(
                "rounded px-2.5 py-1 text-[12px] font-medium transition-colors",
                discipline === d
                  ? "bg-ember text-white"
                  : "bg-sunken text-ink-3 hover:text-ink hover:bg-raised",
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Leaderboard list */}
      {items.length === 0 ? (
        <div className="panel rounded-lg p-12 text-center">
          <Trophy className="mx-auto text-ink-3" size={32} />
          <h3 className="mt-3 text-[16px] font-semibold text-ink">No freelancers found</h3>
          <p className="mt-1 text-[13px] text-ink-3">
            Try adjusting your discipline filter or unchecking Verified only.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-line rounded-lg border border-line bg-surface">
          {items.map((u, i) => {
            const isTop3 = i < 3;
            return (
              <div
                key={u.id}
                className={cn(
                  "flex flex-wrap items-center gap-4 p-4 transition-colors hover:bg-sunken/60 sm:flex-nowrap",
                  isTop3 && i === 0 && "bg-gold-soft/10",
                )}
              >
                {/* Rank number badge */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center font-mono text-[14px] font-bold">
                  {i === 0 ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-bg shadow-sm">
                      1
                    </span>
                  ) : i === 1 ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-2 text-bg">
                      2
                    </span>
                  ) : i === 2 ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ember text-white">
                      3
                    </span>
                  ) : (
                    <span className="num text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                  )}
                </div>

                {/* Freelancer info */}
                <Avatar hue={u.avatarHue} name={u.displayName} size={44} className="shrink-0" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <UserHoverCard username={u.username}>
                      <Link
                        href={routes.profile(u.username)}
                        className="text-[14px] font-semibold text-ink hover:underline"
                      >
                        {u.displayName}
                      </Link>
                    </UserHoverCard>
                    {u.isVerified && <VerifiedMark size={14} />}
                    <span className="num text-[11.5px] text-ink-3">f/{u.username}</span>
                    {u.role !== "member" && (
                      <span className="tag tag-gold text-[10px] uppercase tracking-wider">
                        {u.role}
                      </span>
                    )}
                  </div>

                  {u.headline && (
                    <p className="mt-0.5 text-[12.5px] text-ink-2 truncate max-w-lg">
                      {u.headline}
                    </p>
                  )}

                  {u.skills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {u.skills.slice(0, 5).map((s) => (
                        <span key={s} className="tag text-[10.5px]">
                          {s}
                        </span>
                      ))}
                      {u.skills.length > 5 && (
                        <span className="num text-[10.5px] text-ink-3 self-center">
                          +{u.skills.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="flex shrink-0 items-center gap-4 text-center sm:gap-6">
                  <div>
                    <span className="num block text-[15px] font-semibold text-ember">
                      {formatCompact(u.karma)}
                    </span>
                    <span className="eyebrow text-[9.5px] text-ink-3">karma</span>
                  </div>
                  <div>
                    <span className="num block text-[15px] font-semibold text-ink">
                      {u.solutionCount}
                    </span>
                    <span className="eyebrow text-[9.5px] text-ink-3">solved</span>
                  </div>
                  <div>
                    <span className="num block text-[15px] font-semibold text-ink">
                      {formatCompact(u.followerCount)}
                    </span>
                    <span className="eyebrow text-[9.5px] text-ink-3">followers</span>
                  </div>

                  <FollowButton
                    username={u.username}
                    initialFollowing={u.isFollowing}
                    initialFollowerCount={u.followerCount}
                    size="sm"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
