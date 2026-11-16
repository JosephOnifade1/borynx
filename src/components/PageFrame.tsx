import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ContextRail } from "./shell/ContextRail";
import { RegionErrorBoundary } from "./primitives";

export { Widget } from "./Widget";

interface PageFrameProps {
  children: ReactNode;
  /** Page-specific right column. When omitted, the global context rail is shown. */
  aside?: ReactNode;
  header?: ReactNode;
  /** Wider center column for directories and admin tools. */
  wide?: boolean;
  /** Stream layout: children are individual cards (feeds). Default: one bordered panel. */
  stream?: boolean;
}

/**
 * Reddit / Threads three-column structure:
 *   [ left nav (AppShell Sidebar) ] [ centred 680px stream ] [ sticky right rail (xl+) ]
 * The center column holds the header card and the content stream. Each region sits behind its own
 * error boundary so a failing widget never takes down the feed.
 */
export function PageFrame({ children, aside, header, wide, stream }: PageFrameProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] items-start justify-center gap-6 px-3 py-5 sm:px-5">
      <div className={cn("min-w-0 w-full", wide ? "max-w-[860px]" : "max-w-[680px]")}>
        {header && <div className="mb-3">{header}</div>}
        <RegionErrorBoundary region="feed column">
          {stream ? (
            <main className="min-w-0">{children}</main>
          ) : (
            <main className="panel min-w-0 overflow-hidden rounded-lg">{children}</main>
          )}
        </RegionErrorBoundary>
      </div>
      <RegionErrorBoundary region="context rail" compact>
        <aside className="sticky top-[calc(var(--header-h)+1.25rem)] hidden w-[300px] shrink-0 self-start space-y-4 xl:block" aria-label="Context">
          {aside ?? <ContextRail />}
        </aside>
      </RegionErrorBoundary>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions, accentHue }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; accentHue?: number }) {
  return (
    <header className="panel relative overflow-hidden rounded-lg px-5 pb-5 pt-6 sm:px-6">
      {accentHue !== undefined && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-[0.18]" style={{ background: `radial-gradient(ellipse at 100% 0%, hsl(${accentHue} 70% 50%), transparent 60%)` }} />
      )}
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="display mt-1 text-[26px] sm:text-[30px]">{title}</h1>
          {description && <div className="mt-1.5 max-w-2xl text-[13.5px] text-ink-2">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
