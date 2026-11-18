"use client";

import { useQuery } from "@tanstack/react-query";
import { Award, Bell, Bookmark, Briefcase, Compass, CornerDownLeft, FileText, Hash, PlusCircle, Search, Settings, Trophy, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, queryKeys } from "@/lib/client";
import type { SearchResult } from "@/lib/types";
import { cn, routes } from "@/lib/utils";
import { useUiStore } from "@/store/ui";
import { Dialog } from "./Dialog";

const QUICK: SearchResult[] = [
  { type: "space", id: -1, title: "Browse spaces", subtitle: "/b", href: routes.spaces() },
  { type: "lead", id: -2, title: "Marketplace leads", subtitle: "/l", href: routes.leads() },
  { type: "user", id: -9, title: "Practitioner leaderboard", subtitle: "/leaderboard", href: routes.leaderboard() },
  { type: "lead", id: -5, title: "Post a lead", subtitle: "/l/new", href: routes.leadNew() },
  { type: "post", id: -6, title: "Notifications inbox", subtitle: "/notifications", href: routes.notifications() },
  { type: "post", id: -7, title: "Saved threads", subtitle: "/saved", href: routes.saved() },
  { type: "user", id: -3, title: "Your profile", subtitle: "/me", href: routes.me() },
  { type: "user", id: -8, title: "Profile settings", subtitle: "/settings", href: routes.settings() },
  { type: "post", id: -4, title: "Achievements", subtitle: "/achievements", href: routes.achievements() },
];

const ICON = { space: Hash, user: User, lead: Briefcase, post: FileText } as const;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [selection, setSelection] = useState({ query: "", count: QUICK.length, index: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounced(q, 140);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useUiStore.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.search(debounced),
    queryFn: () => api<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.trim().length > 0,
    staleTime: 30_000,
  });

  const results = useMemo<SearchResult[]>(() => {
    const trimmed = q.trim();
    if (!trimmed) return QUICK;
    const direct: SearchResult[] = [];
    const m = /^([bfl])\/([a-z0-9][a-z0-9_.-]*)$/i.exec(trimmed);
    if (m) {
      const [, p, id] = m;
      direct.push({
        type: p === "b" ? "space" : p === "f" ? "user" : "lead",
        id: 0,
        title: `Go to ${trimmed.toLowerCase()}`,
        subtitle: "direct path",
        href: p === "b" ? routes.space(id.toLowerCase()) : p === "f" ? routes.profile(id.toLowerCase()) : routes.leads(),
      });
    }
    return [...direct, ...(data?.results ?? [])];
  }, [q, data]);

  const resetSelection = selection.query !== q || selection.count !== results.length;
  const active = resetSelection ? 0 : selection.index;
  if (resetSelection) setSelection({ query: q, count: results.length, index: 0 });
  const setActive = (index: number) => setSelection({ query: q, count: results.length, index });

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
  }, [setOpen]);

  const go = useCallback(
    (r: SearchResult | undefined) => {
      if (!r) return;
      close();
      router.push(r.href);
    },
    [close, router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.max(0, Math.min(active + 1, results.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(active - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    }
  };

  return (
    <Dialog open={open} onClose={close} bare className="max-w-xl overflow-hidden" initialFocusRef={inputRef}>
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={16} className="text-ink-3" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search spaces, people, leads, threads — or type b/slug, f/handle"
          className="h-12 w-full bg-transparent text-[14px] outline-none placeholder:text-ink-4"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-activedescendant={results[active] ? `palette-opt-${active}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
        />
        {isFetching && <span className="num text-[10px] uppercase tracking-widest text-ink-3">searching</span>}
      </div>
      <ul id="palette-results" role="listbox" className="max-h-[52vh] overflow-y-auto p-1.5">
        {!q.trim() && <li className="eyebrow px-3 pb-1 pt-2">Quick jump</li>}
        {results.length === 0 && q.trim() && !isFetching && <li className="px-3 py-6 text-center text-[13px] text-ink-3">Nothing matches “{q}”.</li>}
        {results.map((r, i) => {
          let Icon = ICON[r.type];
          if (r.id === -1) Icon = Compass;
          else if (r.id === -4) Icon = Award;
          else if (r.id === -5) Icon = PlusCircle;
          else if (r.id === -6) Icon = Bell;
          else if (r.id === -7) Icon = Bookmark;
          else if (r.id === -8) Icon = Settings;
          else if (r.id === -9) Icon = Trophy;
          return (
            <li
              key={`${r.type}-${r.id}-${r.href}`}
              id={`palette-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r)}
              className={cn("flex cursor-pointer items-center gap-3 rounded-md px-3 py-2", i === active && "bg-sunken")}
            >
              <Icon size={15} className={cn("shrink-0", i === active ? "text-ember" : "text-ink-3")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">{r.title}</span>
                <span className="block truncate text-[11.5px] text-ink-3">{r.subtitle}</span>
              </span>
              {i === active && <CornerDownLeft size={13} className="text-ink-3" />}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[10.5px] text-ink-3">
        <span className="num">↑↓ navigate</span>
        <span className="num">↵ open</span>
        <span className="num">esc close</span>
      </div>
    </Dialog>
  );
}
