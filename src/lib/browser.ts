"use client";

import { useSyncExternalStore } from "react";

const subscribeToHydration = () => () => undefined;

/** Guard client-only forms against native pre-hydration submission. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeToHydration, () => true, () => false);
}

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
    // A failed write can leave a readable but stale entry (e.g., over quota).
    const fallback = memory.get(`${area}:${key}`);
    if (fallback !== undefined) return fallback;
    const store = storageFor(area);
    if (store) {
      try {
        return store.getItem(key);
      } catch {
        /* storage may have been revoked since the probe */
      }
    }
    return null;
  },
  /** Returns true when the value was persisted to real storage, false when it only lives in memory. */
  set(key: string, value: string, area: Area = "local"): boolean {
    const store = storageFor(area);
    if (store) {
      try {
        store.setItem(key, value);
        memory.delete(`${area}:${key}`);
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

/** Session tokens live only in the isolated demo browser: local → session → memory. */
export function getStoredToken(): string | null {
  if (typeof window === "undefined" || !window.__bxDemoMode) return null;
  return safeStorage.get(TOKEN_KEY) ?? safeStorage.get(TOKEN_KEY, "session") ?? window.__bxToken ?? null;
}

/** Install on hydration, including on a server-rendered 404 where inline scripts may not run. */
export function installDemoSessionTransport(): void {
  window.__bxDemoMode = true;
  const original = window.fetch as typeof window.fetch & { __bx?: boolean };
  if (original.__bx) return;

  const wrapped: typeof window.fetch = (input, init) => {
    try {
      const href = input instanceof Request ? input.url : String(input);
      const token = getStoredToken();
      if (token && new URL(href, location.href).origin === location.origin) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        if (!headers.has("x-bx-session")) {
          headers.set("x-bx-session", token);
          init = { ...init, headers };
        }
      }
    } catch {
      // Preserve the native request if the browser rejects a storage/URL/headers access.
    }
    return original.call(window, input, init);
  };
  window.fetch = Object.assign(wrapped, { __bx: true });
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
