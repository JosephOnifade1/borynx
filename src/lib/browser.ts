"use client";

/**
 * Guarded browser storage. Inside cross-site iframes (embedded previews) browsers may throw a
 * SecurityError on *any* access to localStorage/sessionStorage. Every read/write here is wrapped
 * and degrades local → session → in-memory, so storage policy can never crash the app.
 */

type Area = "local" | "session";

const memory = new Map<string, string>();
const availability: Partial<Record<Area, boolean>> = {};

function storageFor(area: Area): Storage | null {
  if (typeof window === "undefined" || availability[area] === false) return null;
  try {
    const store = area === "local" ? window.localStorage : window.sessionStorage;
    if (availability[area] === undefined) {
      const probe = "__bx_probe__";
      store.setItem(probe, "1");
      store.removeItem(probe);
      availability[area] = true;
    }
    return store;
  } catch {
    availability[area] = false;
    return null;
  }
}

export const safeStorage = {
  get(key: string, area: Area = "local"): string | null {
    const store = storageFor(area);
    if (store) {
      try {
        return store.getItem(key);
      } catch {
        /* fall through to memory */
      }
    }
    return memory.get(`${area}:${key}`) ?? null;
  },
  /** Returns true when the value was persisted to real storage, false when it only lives in memory. */
  set(key: string, value: string, area: Area = "local"): boolean {
    const store = storageFor(area);
    if (store) {
      try {
        store.setItem(key, value);
        return true;
      } catch {
        /* quota exceeded or blocked */
      }
    }
    memory.set(`${area}:${key}`, value);
    return false;
  },
  remove(key: string, area: Area = "local"): void {
    memory.delete(`${area}:${key}`);
    const store = storageFor(area);
    if (store) {
      try {
        store.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  },
};

/* ------------------------------------------------------------------ */
/* Session-token fallback (used only when the session cookie is blocked) */
/* ------------------------------------------------------------------ */

export const TOKEN_KEY = "bx-token";

declare global {
  interface Window {
    __bxToken?: string | null;
    __bxDemoMode?: boolean;
  }
}

/** Read order must match the inline fetch shim in app/layout.tsx: local → session → memory. */
export function getStoredToken(): string | null {
  if (typeof window === "undefined" || !window.__bxDemoMode) return null;
  return safeStorage.get(TOKEN_KEY) ?? safeStorage.get(TOKEN_KEY, "session") ?? window.__bxToken ?? null;
}

export function storeToken(token: string): "local" | "session" | "memory" {
  window.__bxToken = token;
  if (safeStorage.set(TOKEN_KEY, token)) return "local";
  if (safeStorage.set(TOKEN_KEY, token, "session")) return "session";
  return "memory";
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  window.__bxToken = null;
  safeStorage.remove(TOKEN_KEY);
  safeStorage.remove(TOKEN_KEY, "session");
}
