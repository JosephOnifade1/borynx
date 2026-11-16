"use client";

import { LogOut, Moon, Plus, Search, Shield, Sun, User as UserIcon, Award, Bell, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/components/providers";
import { Avatar, Logo, VerifiedMark } from "@/components/primitives";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { clearStoredToken } from "@/lib/browser";
import { api } from "@/lib/client";
import { routes } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

export function Header() {
  const user = useSession();
  const router = useRouter();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const signOut = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* session already gone — still clear local state */
    }
    clearStoredToken();
    setMenuOpen(false);
    router.push("/");
    router.refresh();
  };

  const isStaff = user?.role === "admin" || user?.role === "moderator";

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-[var(--header-h)] border-b border-line bg-[color-mix(in_oklab,var(--bg)_82%,transparent)] backdrop-blur-md">
      {/* Logo is locked to a fixed coordinate; sidebar state never moves it. */}
      <Link href="/" className="absolute left-5 top-1/2 -translate-y-1/2 rounded-sm" aria-label="Borynx home">
        <Logo />
      </Link>

      <div className="absolute left-[172px] top-1/2 hidden -translate-y-1/2 items-center gap-1 md:flex">
        <span className="eyebrow hidden xl:inline">Professional network for tech freelancers</span>
      </div>

      <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
        <button type="button" onClick={() => setPaletteOpen(true)} className="btn btn-ghost h-8 gap-2 pr-2 text-ink-3" aria-label="Open command palette" aria-keyshortcuts="Meta+K Control+K">
          <Search size={15} />
          <span className="hidden text-[12.5px] sm:inline">Jump to…</span>
          <kbd className="num hidden rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-ink-3 sm:inline">⌘K</kbd>
        </button>

        <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="btn btn-ghost h-8 w-8 justify-center px-0" aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {user ? (
          <>
            <NotificationBell />
            <Link href={routes.leadNew()} className="btn btn-primary h-8 hidden sm:inline-flex">
              <Plus size={14} /> Post lead
            </Link>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex h-8 items-center gap-2 rounded-md border border-transparent pl-1 pr-2 hover:border-line"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Account menu"
              >
                <Avatar hue={user.avatarHue} name={user.displayName} size={24} />
                <span className="hidden text-[12.5px] font-medium md:inline">{user.username}</span>
                {user.isVerified && <VerifiedMark size={13} />}
              </button>
              {menuOpen && (
                <div role="menu" className="panel-raised absolute right-0 mt-1.5 w-56 rounded-md p-1">
                  <div className="px-3 py-2">
                    <p className="text-[13px] font-semibold">{user.displayName}</p>
                    <p className="num text-[11px] text-ink-3">
                      {user.karma.toLocaleString("en-US")} karma · {user.role}
                    </p>
                  </div>
                  <div className="my-1 border-t border-line" />
                  <MenuLink href={routes.notifications()} icon={Bell} label="Notifications" onClick={() => setMenuOpen(false)} />
                  <MenuLink href={routes.me()} icon={UserIcon} label="Your profile" onClick={() => setMenuOpen(false)} />
                  <MenuLink href={routes.settings()} icon={Settings} label="Settings" onClick={() => setMenuOpen(false)} />
                  <MenuLink href={routes.achievements()} icon={Award} label="Achievements" onClick={() => setMenuOpen(false)} />
                  {isStaff && <MenuLink href={routes.modQueue()} icon={Shield} label="Moderation queue" onClick={() => setMenuOpen(false)} />}
                  <div className="my-1 border-t border-line" />
                  <button type="button" role="menuitem" onClick={signOut} className="nav-item h-8 w-full rounded-md text-[13px]">
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <Link href={routes.login()} className="btn btn-primary h-8">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

function MenuLink({ href, icon: Icon, label, onClick }: { href: string; icon: typeof UserIcon; label: string; onClick: () => void }) {
  return (
    <Link href={href} role="menuitem" onClick={onClick} className="nav-item h-8 rounded-md text-[13px]">
      <Icon size={14} /> {label}
    </Link>
  );
}
