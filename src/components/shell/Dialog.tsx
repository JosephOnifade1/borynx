"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Hide the chrome (used by the command palette). */
  bare?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

/** Accessible modal: focus trap, Esc dismissal, scroll lock, focus restoration, aria wiring. */
export function Dialog({ open, onClose, title, description, children, className, bare, initialFocusRef }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  const initialFocusTargetRef = useRef(initialFocusRef);
  useEffect(() => {
    onCloseRef.current = onClose;
    initialFocusTargetRef.current = initialFocusRef;
  }, [onClose, initialFocusRef]);

  const hasFocusedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      hasFocusedRef.current = false;
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // ONLY perform initial focus once when opening, NEVER on re-renders while typing
    if (!hasFocusedRef.current) {
      hasFocusedRef.current = true;
      window.requestAnimationFrame(() => {
        const target = initialFocusTargetRef.current?.current ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
        target?.focus();
      });
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && panel) {
        const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (n) => n.offsetParent !== null && !n.hasAttribute("disabled"),
        );
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 overflow-y-auto" role="presentation">
      <div className="fixed inset-0 bg-[color-mix(in_oklab,var(--ink)_55%,transparent)] backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn("panel-raised relative flex flex-col w-full max-w-lg max-h-[92vh] rounded-lg shadow-2xl outline-none my-auto overflow-hidden", className)}
      >
        {!bare && (
          <header className="hairline-b flex items-start justify-between gap-4 px-5 py-3.5 shrink-0">
            <div>
              {title && (
                <h2 id={titleId} className="display text-[17px]">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="mt-0.5 text-[12.5px] text-ink-3">
                  {description}
                </p>
              )}
            </div>
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm -mr-2 text-ink-3 hover:text-ink" aria-label="Close dialog">
              <X size={15} />
            </button>
          </header>
        )}
        {children}
      </div>
    </div>
  );
}
