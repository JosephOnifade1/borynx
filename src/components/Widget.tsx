import type { ReactNode } from "react";

/** Titled context card used in the right rail and page asides. Server-safe (no hooks). */
export function Widget({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="panel rounded-lg">
      <header className="hairline-b flex items-center justify-between px-4 py-2.5">
        <h2 className="eyebrow">{title}</h2>
        {action}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}
