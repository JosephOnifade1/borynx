"use client";

import { Activity, Award, Briefcase, ChevronsLeft, ChevronsRight, Compass, Home, PanelLeft, Shield, Bookmark, Trophy, User, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo } from "react";
import { useSession } from "@/components/providers";
import { cn, routes } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

export interface SidebarSpace {
  slug: string;
  name: string;
  accentHue: number;
  modRole: string | null;
}

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

const primary: NavLink[] = [
  { href: routes.home(), label: "Feed", icon: Home, match: (p) => p === "/" },
  { href: routes.spaces(), label: "Communities", icon: Compass, match: (p) => p === "/b" },
  { href: routes.leads(), label: "Leads", icon: Briefcase, match: (p) => p === "/l" || p.startsWith("/l/") },
  { href: routes.leaderboard(), label: "Leaderboard", icon: Trophy, match: (p) => p === "/leaderboard" },
  { href: routes.me(), label: "Profile", icon: User, match: (p) => p === "/me" || p.startsWith("/f/") },
  { href: routes.achievements(), label: "Achievements", icon: Award, match: (p) => p.startsWith("/achievements") },
  { href: "/status", label: "System status", icon: Activity, match: (p) => p === "/status" },
];

const NavItem = memo(function NavItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <Link href={href} className="nav-item" aria-current={active ? "page" : undefined}>
      <Icon size={16} strokeWidth={2.1} className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
});

export function Sidebar({ spaces }: { spaces: SidebarSpace[] }) {
  const pathname = usePathname();
  const user = useSession();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const peek = useUiStore((s) => s.sidebarPeek);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const setPeek = useUiStore((s) => s.setSidebarPeek);

  const open = !collapsed || peek;
  const isStaff = user?.role === "admin" || user?.role === "moderator";
  const modSpaces = spaces.filter((s) => s.modRole);

  return (
    <aside
      className={cn("relative hidden shrink-0 lg:block", collapsed && !peek && "overflow-hidden")}
      style={{ width: collapsed ? "var(--sidebar-rail)" : "var(--sidebar-w)", transition: "width 240ms cubic-bezier(.2,.8,.2,1)" }}
      aria-label="Primary navigation"
      onMouseLeave={() => collapsed && setPeek(false)}
    >
      {/* Collapsed frame — the interactive hit-zone */}
      <button
        type="button"
        aria-label="Expand navigation"
        onMouseEnter={() => collapsed && setPeek(true)}
        onFocus={() => collapsed && setPeek(true)}
        onClick={toggle}
        className={cn(
          "sticky top-[var(--header-h)] flex h-[calc(100vh-var(--header-h))] w-[var(--sidebar-rail)] flex-col items-center gap-3 border-r border-line pt-4 text-ink-3 transition-opacity hover:text-ink",
          collapsed ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        tabIndex={collapsed ? 0 : -1}
      >
        <PanelLeft size={16} />
        <span className="eyebrow mt-2 [writing-mode:vertical-rl] rotate-180 select-none">navigate</span>
        <span className="mt-auto mb-4">
          <ChevronsRight size={14} />
        </span>
      </button>

      {/* Inner panel — fixed intrinsic width, slides via transform */}
      <div
        className={cn(
          "absolute left-0 top-0 h-full w-[var(--sidebar-w)] border-r border-line bg-bg",
          collapsed && peek && "z-40 shadow-[var(--shadow)] bg-surface",
        )}
        style={{
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 240ms cubic-bezier(.2,.8,.2,1), box-shadow 240ms ease",
        }}
        aria-hidden={!open}
      >
        <div className="sticky top-[var(--header-h)] flex h-[calc(100vh-var(--header-h))] flex-col overflow-y-auto pb-4">
          <nav className="nav-gutter pt-3">
            <div className="flex items-center justify-between px-3 pb-2">
              <span className="eyebrow">Navigate</span>
              <button type="button" onClick={toggle} className="btn btn-ghost btn-sm -mr-2 h-6 px-1.5" aria-label={collapsed ? "Pin navigation open" : "Collapse navigation"} tabIndex={open ? 0 : -1}>
                <ChevronsLeft size={14} />
              </button>
            </div>
            <ul className="space-y-0.5">
              {primary.map((item) => (
                <li key={item.href}>
                  <NavItem href={item.href} label={item.label} icon={item.icon} active={item.match(pathname)} />
                </li>
              ))}
              {user && (
                <li>
                  <NavItem href="/saved" label="Saved" icon={Bookmark} active={pathname === "/saved"} />
                </li>
              )}
              {isStaff && (
                <li>
                  <NavItem href={routes.modQueue()} label="Mod queue" icon={Shield} active={pathname.startsWith("/mod")} />
                </li>
              )}
            </ul>
          </nav>

          {spaces.length > 0 && (
            <nav className="nav-gutter mt-5" aria-label="Your spaces">
              <div className="px-3 pb-2">
                <span className="eyebrow">Your spaces</span>
              </div>
              <ul className="space-y-0.5">
                {spaces.map((s) => {
                  const active = pathname === routes.space(s.slug) || pathname.startsWith(`${routes.space(s.slug)}/`);
                  return (
                    <li key={s.slug}>
                      <Link href={routes.space(s.slug)} className="nav-item" aria-current={active ? "page" : undefined}>
                        <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: `hsl(${s.accentHue} 60% 48%)` }} aria-hidden="true" />
                        <span className="truncate">
                          <span className="num text-ink-3">b/</span>
                          {s.slug}
                        </span>
                        {s.modRole && <span className="num ml-auto text-[9px] uppercase tracking-wider text-gold">{s.modRole === "owner" ? "own" : "mod"}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}

          {modSpaces.length > 0 && (
            <nav className="nav-gutter mt-5" aria-label="Moderation">
              <div className="px-3 pb-2">
                <span className="eyebrow">Mod tools</span>
              </div>
              <ul className="space-y-0.5">
                {modSpaces.map((s) => (
                  <li key={s.slug}>
                    <Link href={routes.spaceMod(s.slug)} className="nav-item" aria-current={pathname === routes.spaceMod(s.slug) ? "page" : undefined}>
                      <Shield size={14} className="shrink-0 text-gold" />
                      <span className="truncate text-[12.5px]">{s.slug} / mod</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div className="nav-gutter mt-auto pt-6">
            <div className="rounded-md border border-dashed border-line-strong px-3 py-2.5">
              <p className="eyebrow">Shortcuts</p>
              <dl className="num mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-ink-3">
                <dt className="text-ink">⌘K</dt>
                <dd>jump anywhere</dd>
                <dt className="text-ink">J / K</dt>
                <dd>next / prev post</dd>
                <dt className="text-ink">Enter</dt>
                <dd>open focused</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
