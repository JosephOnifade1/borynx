import type { DbStatus } from "@/db/bootstrap";
import { Logo } from "./primitives";

/** Rendered by the root layout when the database bootstrap fails — the preview always shows something useful. */
export function DatabaseOffline({ status }: { status: DbStatus }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <meta httpEquiv="refresh" content="6" />
      <Logo />
      <section className="panel mt-6 rounded-lg border-l-[3px] border-l-danger p-6" role="alert">
        <p className="eyebrow text-danger">Database unavailable · failed during {status.stage}</p>
        <h1 className="display mt-2 text-[26px]">Borynx can&apos;t reach PostgreSQL yet</h1>
        <p className="mt-2 text-[13.5px] text-ink-2">
          On boot the app connects to Postgres, applies its Drizzle migrations from <code className="num">/drizzle</code>, and seeds itself. That sequence stopped here:
        </p>
        <pre className="num mt-3 overflow-x-auto whitespace-pre-wrap rounded-md border border-line bg-sunken p-3 text-[12px] text-danger">{status.error ?? "Unknown error"}</pre>
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-[13px] text-ink-2">
          <li>
            Make sure PostgreSQL is running and <code className="num">DATABASE_URL</code> in <code className="num">.env</code> points at it.
          </li>
          <li>
            Migrations can also be applied by hand with <code className="num">npx drizzle-kit migrate</code> — it shares the app&apos;s ledger.
          </li>
          <li>This page retries automatically every few seconds.</li>
        </ol>
        <a href="" className="btn btn-primary mt-5">
          Retry now
        </a>
      </section>
      <p className="num mt-3 text-[11px] text-ink-3">
        attempt finished {status.finishedAt} · {status.durationMs}ms
      </p>
    </main>
  );
}
