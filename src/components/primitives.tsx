"use client";

import {
  Award,
  Briefcase,
  Check,
  CheckCheck,
  MessagesSquare,
  Network,
  PenLine,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Component, memo, type ErrorInfo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ---------------- Logo ---------------- */

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
        <rect x="1" y="1" width="22" height="22" rx="5" fill="var(--ink)" />
        <path d="M7 6h6.2c2.6 0 4.1 1.3 4.1 3.3 0 1.3-.7 2.3-1.9 2.8 1.6.4 2.6 1.6 2.6 3.2 0 2.3-1.7 3.7-4.6 3.7H7V6Zm5.7 5.2c1.1 0 1.8-.6 1.8-1.5s-.7-1.5-1.8-1.5H9.8v3h2.9Zm.4 5.6c1.3 0 2-.6 2-1.6s-.7-1.6-2-1.6H9.8v3.2h3.3Z" fill="var(--bg)" />
        <circle cx="18.5" cy="5.5" r="2" fill="var(--ember)" />
      </svg>
      <span className="display text-[17px] tracking-[-0.03em]">Borynx</span>
    </span>
  );
}

/* ---------------- Avatar ---------------- */

export const Avatar = memo(function Avatar({ hue, name, size = 28, className }: { hue: number; name: string; size?: number; className?: string }) {
  const initials = name
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[6px] font-semibold text-white", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size * 0.38),
        background: `linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 60% 30%))`,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)",
      }}
    >
      {initials}
    </span>
  );
});

export function VerifiedMark({ className, size = 14 }: { className?: string; size?: number }) {
  return (
    <span title="Verified Pro" aria-label="Verified Pro" className={cn("inline-flex items-center text-verdigris", className)}>
      <ShieldCheck size={size} strokeWidth={2.4} />
    </span>
  );
}

/* ---------------- Badges ---------------- */

const BADGE_ICONS: Record<string, LucideIcon> = {
  "shield-check": ShieldCheck,
  "pen-line": PenLine,
  "trending-up": TrendingUp,
  award: Award,
  "check-check": CheckCheck,
  check: Check,
  briefcase: Briefcase,
  network: Network,
  "messages-square": MessagesSquare,
};

/** Server-safe icon renderer (client component boundary). */
export function BadgeIcon({ icon, size = 20 }: { icon: string; size?: number }) {
  const Icon = BADGE_ICONS[icon] ?? Award;
  return <Icon size={size} />;
}

const TIER_CLASS: Record<number, string> = {
  1: "tag",
  2: "tag tag-verdigris",
  3: "tag tag-gold",
};

export const BadgeChip = memo(function BadgeChip({ icon, name, tier, locked, className }: { icon: string; name: string; tier: number; locked?: boolean; className?: string }) {
  const Icon = BADGE_ICONS[icon] ?? Award;
  return (
    <span className={cn(TIER_CLASS[tier] ?? "tag", locked && "opacity-45 grayscale", className)} title={name}>
      <Icon size={11} strokeWidth={2.4} />
      {name}
    </span>
  );
});

/* ---------------- Error boundary ---------------- */

interface BoundaryProps {
  region: string;
  children: ReactNode;
  compact?: boolean;
}
interface BoundaryState {
  error: Error | null;
}

export class RegionErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[borynx:${this.props.region}]`, error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className={cn("panel rounded-md border-l-[3px] border-l-danger", this.props.compact ? "p-3" : "p-5")}>
        <p className="eyebrow text-danger">Region failed · {this.props.region}</p>
        <p className="mt-1 text-[13px] text-ink-2">This region hit an error and was isolated so the rest of the page keeps working.</p>
        <button type="button" className="btn btn-sm mt-3" onClick={() => this.setState({ error: null })}>
          Retry region
        </button>
      </div>
    );
  }
}

/* ---------------- Skeletons (geometry-matched) ---------------- */

export function PostRowSkeleton() {
  return (
    <div className="panel flex gap-3 rounded-lg p-3">
      <div className="flex w-10 flex-col items-center gap-1.5 pt-0.5">
        <div className="skeleton h-4 w-4" />
        <div className="skeleton h-3.5 w-6" />
        <div className="skeleton h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-3 w-16" />
        </div>
        <div className="skeleton mt-2 h-4 w-[72%]" />
        <div className="skeleton mt-1.5 h-3 w-[92%]" />
        <div className="skeleton mt-1 h-3 w-[55%]" />
        <div className="mt-2.5 flex gap-2">
          <div className="skeleton h-5 w-14" />
          <div className="skeleton h-5 w-20" />
        </div>
      </div>
    </div>
  );
}

export function FeedSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading feed">
      {Array.from({ length: rows }).map((_, i) => (
        <PostRowSkeleton key={i} />
      ))}
    </div>
  );
}

export function LeadRowSkeleton() {
  return (
    <div className="panel grid grid-cols-[48px_1fr_auto] gap-3 rounded-lg p-3">
      <div className="skeleton h-10 w-10" />
      <div>
        <div className="skeleton h-4 w-[64%]" />
        <div className="skeleton mt-2 h-3 w-[88%]" />
        <div className="mt-2.5 flex gap-2">
          <div className="skeleton h-5 w-16" />
          <div className="skeleton h-5 w-16" />
        </div>
      </div>
      <div className="skeleton h-6 w-24" />
    </div>
  );
}

export function WidgetSkeleton() {
  return (
    <div className="panel rounded-md p-4">
      <div className="skeleton h-3 w-20" />
      <div className="skeleton mt-3 h-4 w-[80%]" />
      <div className="skeleton mt-2 h-3 w-full" />
      <div className="skeleton mt-1 h-3 w-[70%]" />
    </div>
  );
}
