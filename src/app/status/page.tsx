import { Activity, CheckCircle2, Circle, Database, KeyRound, Table2 } from "lucide-react";
import Link from "next/link";
import { PageFrame, PageHeader, Widget } from "@/components/PageFrame";
import { databaseSnapshot, ensureDatabase } from "@/db/bootstrap";
import { getDemoAccountMode, getSession } from "@/lib/auth";
import { routes } from "@/lib/utils";

export const metadata = { title: "System status" };

function formatBytes(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function Step({ label, done, detail }: { label: string; done: boolean; detail?: string }) {
  return (
    <li className="flex items-start gap-2">
      {done ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" /> : <Circle size={14} className="mt-0.5 shrink-0 text-ink-4" />}
      <span>
        <span className="block text-ink">{label}</span>
        {detail && <span className="num block text-[11px] text-ink-3">{detail}</span>}
      </span>
    </li>
  );
}

export default async function StatusPage() {
  const status = await ensureDatabase();
  if (!status.ok || await getDemoAccountMode() === "disabled") {
    return (
      <PageFrame header={<PageHeader eyebrow="System" title="Service status" />}><p className="px-5 py-6 text-[13px]">{status.ok ? "Borynx is operational." : "Borynx is temporarily unavailable."}</p></PageFrame>
    );
  }
  const [snapshot, session] = await Promise.all([databaseSnapshot(), getSession()]);
  const totalRows = snapshot.tables.reduce((sum, t) => sum + t.rows, 0);
  const engine = snapshot.version.split(" ").slice(0, 2).join(" ");

  return (
    <PageFrame wide
      header={
        <PageHeader
          eyebrow="System · live readout"
          title="Database & runtime"
          description="Every figure below is queried from PostgreSQL through Drizzle on this request. The schema is applied by Drizzle migrations when the server boots — a fresh database needs no manual step."
          actions={<span className={status.ok ? "tag tag-success" : "tag tag-danger"}>{status.ok ? "operational" : "degraded"}</span>}
        />
      }
      aside={
        <>
          <Widget title="Your session">
            {session ? (
              <div className="space-y-1.5 text-[12.5px]">
                <p className="flex items-center gap-1.5">
                  <KeyRound size={13} className="text-verdigris" /> Signed in as{" "}
                  <Link href={routes.profile(session.user.username)} className="num font-semibold hover:underline">
                    f/{session.user.username}
                  </Link>
                </p>
                <p className="text-ink-3">
                  Transport: <span className="num font-medium text-ink">{session.transport === "cookie" ? "HttpOnly cookie" : "x-bx-session header (cookie blocked by this browser)"}</span>
                </p>
                <p className="text-ink-3">Stored server-side as a SHA-256 hash in the sessions table.</p>
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-3">
                Not signed in.{" "}
                <Link href={routes.login()} className="font-medium text-ember hover:underline">
                  Sign in
                </Link>{" "}
                to create a database session.
              </p>
            )}
          </Widget>
          <Widget title="Boot sequence">
            <ol className="space-y-2.5 text-[12.5px]">
              <Step label="Connect to PostgreSQL" done={status.ok || status.stage !== "connect"} />
              <Step label="Migration ledger verified" done={status.ok} detail="drizzle.__drizzle_migrations" />
              <Step label="Apply Drizzle migrations" done={status.migrationsApplied >= status.migrationsAvailable && status.migrationsAvailable > 0} detail={`${status.migrationsApplied}/${status.migrationsAvailable} applied`} />
              <Step label="Seed" done={status.seed === "inserted" || status.seed === "present"} detail={status.seed === "inserted" ? "inserted on this boot" : status.seed === "present" ? "data already present" : (status.seedError ?? status.seed)} />
            </ol>
            <p className="num mt-3 text-[11px] text-ink-3">boot finished in {status.durationMs}ms</p>
          </Widget>
        </>
      }
    >
      <section aria-labelledby="conn" className="hairline-b px-5 py-5">
        <h2 id="conn" className="eyebrow flex items-center gap-1.5">
          <Database size={12} /> Connection
        </h2>
        <dl className="num mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
          {[
            ["engine", engine],
            ["database", snapshot.database],
            ["round-trip", `${snapshot.latencyMs} ms`],
            ["size", formatBytes(snapshot.sizeBytes)],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface p-3">
              <dt className="eyebrow">{k}</dt>
              <dd className="mt-1 truncate text-[14px] font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="num mt-2 text-[11px] text-ink-3">server time {snapshot.serverTime}</p>
      </section>

      <section aria-labelledby="tables" className="hairline-b px-5 py-5">
        <h2 id="tables" className="eyebrow flex items-center gap-1.5">
          <Table2 size={12} /> Tables · {snapshot.tables.length} · {totalRows.toLocaleString("en-US")} rows
        </h2>
        <ul className="num mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
          {snapshot.tables.map((t) => (
            <li key={t.name} className="flex items-center justify-between bg-surface px-3 py-2 text-[12.5px]">
              <span className="text-ink-2">{t.name}</span>
              <span className="font-semibold">{t.rows.toLocaleString("en-US")}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ledger" className="px-5 py-5">
        <h2 id="ledger" className="eyebrow flex items-center gap-1.5">
          <Activity size={12} /> Drizzle migration ledger
        </h2>
        <div className="mt-3 overflow-x-auto rounded-md border border-line">
          <table className="num w-full text-left text-[12px]">
            <thead className="bg-sunken text-ink-3">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">migration</th>
                <th className="px-3 py-2 font-medium">sha256</th>
                <th className="px-3 py-2 font-medium">generated</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.ledger.map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="px-3 py-2 text-ink-3">{m.id}</td>
                  <td className="px-3 py-2 font-semibold">{m.tag}</td>
                  <td className="px-3 py-2 text-ink-3">{m.hash.slice(0, 12)}…</td>
                  <td className="px-3 py-2 text-ink-3">{m.generatedAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11.5px] text-ink-3">
          The app and <code>npm run db:migrate</code> verify the same ledger before applying new migrations.
        </p>
      </section>
    </PageFrame>
  );
}
