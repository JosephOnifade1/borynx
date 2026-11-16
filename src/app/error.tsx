"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Route-level boundary: the shell (header, sidebar) stays alive; only the page region resets. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[borynx:route]", error);
  }, [error]);
  return (
    <div className="mx-auto max-w-[1180px] px-5 py-16">
      <section role="alert" className="panel mx-auto max-w-lg rounded-lg border-l-[3px] border-l-danger p-8">
        <p className="eyebrow text-danger">Page failed to render</p>
        <h1 className="display mt-2 text-[24px]">This page hit an error</h1>
        <p className="mt-2 text-[13.5px] text-ink-2">{error.message || "Unexpected error."}</p>
        {error.digest && <p className="num mt-1 text-[11px] text-ink-3">digest {error.digest}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="btn">
            Front page
          </Link>
          <Link href="/status" className="btn">
            System status
          </Link>
        </div>
      </section>
    </div>
  );
}
