"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, Suspense, useContext, useEffect, useState, type ReactNode } from "react";
import type { PublicUser } from "@/lib/auth";
import { clearStoredToken, getStoredToken, safeStorage } from "@/lib/browser";
import { api } from "@/lib/client";
import { useUiStore } from "@/store/ui";

/* ---------------- Session ---------------- */

const SessionContext = createContext<PublicUser | null>(null);
export const useSession = (): PublicUser | null => useContext(SessionContext);

const VISITOR_KEY = "bx-visitor";
const REF_KEY = "bx-referral";
/** Once per document: a full page load resets it (new JS context); a failed refresh can never loop. */
let reconciledThisDocument = false;

/**
 * Header-fallback reconciliation. A full document load never carries the x-bx-session header, so
 * when cookies are blocked the server renders signed-out. If this tab holds a token, validate it
 * and re-fetch the RSC tree (the inline fetch shim attaches the header to that request).
 */
function SessionReconciler({ user }: { user: PublicUser | null }): null {
  const router = useRouter();
  useEffect(() => {
    if (user) return;
    const token = getStoredToken();
    if (!token || reconciledThisDocument) return;
    reconciledThisDocument = true;
    api<{ user: PublicUser | null }>("/api/me", { cache: "no-store" })
      .then((r) => {
        if (r.user) router.refresh();
        else clearStoredToken();
      })
      .catch(() => undefined);
  }, [user, router]);
  return null;
}

/* ---------------- UI preference hydration ---------------- */

function UiHydrator(): null {
  useEffect(() => {
    useUiStore.getState().hydrate();
  }, []);
  return null;
}

/* ---------------- Referral capture ---------------- */

function ReferralCapture(): null {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const shareId = params.get("share_id");
    const refId = params.get("ref_id");
    if (!shareId && !refId) return;
    let visitorKey = safeStorage.get(VISITOR_KEY);
    if (!visitorKey) {
      visitorKey = Math.random().toString(36).slice(2) + Date.now().toString(36);
      safeStorage.set(VISITOR_KEY, visitorKey);
    }
    const payload = { shareId: shareId ?? `legacy-${refId}`, refId: refId ? Number(refId) : null, landingPath: pathname, visitorKey };
    safeStorage.set(REF_KEY, JSON.stringify(payload), "session");
    void api("/api/referrals", { method: "POST", json: payload }).catch(() => undefined);
    // Strip attribution params so the canonical URL is what users copy next.
    const clean = new URLSearchParams(params.toString());
    clean.delete("share_id");
    clean.delete("ref_id");
    const qs = clean.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  return null;
}

export function readStoredReferral(): { shareId: string; refId: number | null } | null {
  const raw = safeStorage.get(REF_KEY, "session");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { shareId: string; refId: number | null };
  } catch {
    return null;
  }
}

/* ---------------- Toast ---------------- */

function Toast(): ReactNode {
  const toast = useUiStore((s) => s.toast);
  const dismiss = useUiStore((s) => s.dismissToast);
  if (!toast) return null;
  const tone = toast.tone === "error" ? "border-danger text-danger" : toast.tone === "success" ? "border-success text-success" : "border-line-strong text-ink";
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[90] flex justify-center px-4">
      <button type="button" onClick={dismiss} className={`panel-raised pointer-events-auto flex items-center gap-3 rounded-md border-l-[3px] px-4 py-2.5 text-[13px] font-medium ${tone}`}>
        <span className="num text-[10px] uppercase tracking-widest opacity-70">{toast.tone}</span>
        {toast.message}
      </button>
    </div>
  );
}

/* ---------------- Root provider ---------------- */

export function Providers({ children, user }: { children: ReactNode; user: PublicUser | null }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: false },
          mutations: { retry: 0 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={user}>
        <UiHydrator />
        <SessionReconciler user={user} />
        <Suspense fallback={null}>
          <ReferralCapture />
        </Suspense>
        {children}
        <Toast />
      </SessionContext.Provider>
    </QueryClientProvider>
  );
}
