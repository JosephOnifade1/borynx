"use client";

import "./globals.css";

/** Last-resort boundary for failures in the root layout itself. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
          <section role="alert" className="panel rounded-lg border-l-[3px] border-l-danger p-8">
            <p className="eyebrow text-danger">Borynx · application error</p>
            <h1 className="display mt-2 text-[24px]">Something broke while loading the app</h1>
            <p className="mt-2 text-[13.5px] text-ink-2">{error.message || "Unexpected error."}</p>
            {error.digest && <p className="num mt-1 text-[11px] text-ink-3">digest {error.digest}</p>}
            <div className="mt-5 flex gap-2">
              <button type="button" className="btn btn-primary" onClick={reset}>
                Reload
              </button>
              <a href="/status" className="btn">
                System status
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
