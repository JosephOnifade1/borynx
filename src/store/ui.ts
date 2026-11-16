"use client";

import { create } from "zustand";
import type { ReportTarget } from "@/db/schema";
import { safeStorage } from "@/lib/browser";

export type Theme = "light" | "dark";

export interface ReportTargetRef {
  type: ReportTarget;
  id: number;
  label: string;
  spaceId?: number | null;
}

interface UiState {
  hydrated: boolean;
  sidebarCollapsed: boolean;
  sidebarPeek: boolean;
  paletteOpen: boolean;
  theme: Theme;
  reportTarget: ReportTargetRef | null;
  toast: { id: number; message: string; tone: "info" | "success" | "error" } | null;
  hydrate: () => void;
  toggleSidebar: () => void;
  setSidebarPeek: (peek: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setTheme: (theme: Theme) => void;
  openReport: (target: ReportTargetRef) => void;
  closeReport: () => void;
  notify: (message: string, tone?: "info" | "success" | "error") => void;
  dismissToast: () => void;
}

const THEME_KEY = "bx-theme";
const SIDEBAR_KEY = "bx-sidebar";

/**
 * UI-only state (server data lives in TanStack Query). Initial values are deterministic so the
 * server HTML and the first client render match exactly — persisted preferences are applied by
 * `hydrate()` after mount. Nothing here touches browser storage at module-evaluation time.
 */
export const useUiStore = create<UiState>((set, get) => ({
  hydrated: false,
  sidebarCollapsed: false,
  sidebarPeek: false,
  paletteOpen: false,
  theme: "light",
  reportTarget: null,
  toast: null,
  hydrate: () => {
    if (get().hydrated) return;
    set({
      hydrated: true,
      sidebarCollapsed: safeStorage.get(SIDEBAR_KEY) === "collapsed",
      theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
    });
  },
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    safeStorage.set(SIDEBAR_KEY, next ? "collapsed" : "open");
    set({ sidebarCollapsed: next, sidebarPeek: false });
  },
  setSidebarPeek: (sidebarPeek) => set({ sidebarPeek }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setTheme: (theme) => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    safeStorage.set(THEME_KEY, theme);
    set({ theme });
  },
  openReport: (reportTarget) => set({ reportTarget }),
  closeReport: () => set({ reportTarget: null }),
  notify: (message, tone = "info") => {
    const id = Date.now();
    set({ toast: { id, message, tone } });
    window.setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 3200);
  },
  dismissToast: () => set({ toast: null }),
}));

/** Memoised slice selectors. */
export const selectTheme = (s: UiState) => s.theme;
export const selectPalette = (s: UiState) => s.paletteOpen;
