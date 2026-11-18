import type { DbStatus } from "@/db/bootstrap";
import { Logo } from "./primitives";

/** Rendered by the root layout when the database bootstrap fails — the preview always shows something useful. */
export function DatabaseOffline({ status, showDiagnostics }: { status: DbStatus; showDiagnostics: boolean }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <meta httpEquiv="refresh" content="6" />
      <Logo />
      <section className="panel mt-6 rounded-lg border-l-[3px] border-l-danger p-6" role="alert">
        <p className="eyebrow text-danger">Database unavailable</p>
        <h1 className="display mt-2 text-[26px]">Borynx is temporarily unavailable</h1>
        <p className="mt-2 text-[13.5px] text-ink-2">
          {showDiagnostics ? `Database setup stopped during ${status.stage}.` : "The database is not ready. Please try again shortly."}
        </p>
        {showDiagnostics && (
          <>
            <pre className="num mt-3 overflow-x-auto whitespace-pre-wrap rounded-md border border-line bg-sunken p-3 text-[12px] text-danger">{status.error ?? "Unknown error"}</pre>
            <p className="mt-3 text-[13px] text-ink-2">Check the server logs and verify the dedicated <code className="num">DATABASE_URL</code> before running migrations manually.</p>
          </>
        )}
        <a href="" className="btn btn-primary mt-5">
          Retry now
        </a>
      </section>
    </main>
  );
}
