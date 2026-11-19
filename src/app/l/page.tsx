import { count, sql } from "drizzle-orm";
import { Megaphone, Plus } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { LeadFeed } from "@/components/leads/LeadFeed";
import { PageFrame, PageHeader, Widget } from "@/components/PageFrame";
import { getSession } from "@/lib/auth";
import { LEAD_CATEGORIES } from "@/lib/constants";
import { openPublicLead } from "@/lib/lead-access";
import { readLeadPageFilters } from "@/lib/lead-discovery";
import { getSponsoredLead, listLeads } from "@/lib/lead-feed";
import { leadServicePrice } from "@/lib/lead-service-policy";
import { formatBudget, routes } from "@/lib/utils";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [session, search] = await Promise.all([getSession(), searchParams]);
  const viewer = session?.user;
  const pilotOpen = leadServicePrice("assisted_hire") !== null || leadServicePrice("sponsored_lead") !== null;
  const { filters, filterError } = readLeadPageFilters(search);
  const viewerId = viewer?.id ?? null;
  const [[stats], byCategory, initialPage, sponsored] = await Promise.all([
    db.select({ open: count(), verified: sql<number>`count(*) filter (where ${leads.isVerified})` }).from(leads).where(openPublicLead),
    db.select({ category: leads.category, c: count() }).from(leads).where(openPublicLead).groupBy(leads.category),
    filterError ? null : listLeads({ filters, viewerId }),
    filterError ? null : getSponsoredLead(filters),
  ]);
  const catMap = new Map(byCategory.map((r) => [r.category, r.c]));
  return (
    <PageFrame
      stream
      header={
        <PageHeader
          eyebrow="Marketplace"
          title="Leads & bounties"
          description="Find contracts, bounties, and roles across tech. New leads appear here only after a site reviewer publishes them."
          actions={
            <>
              {pilotOpen && session?.kind === "email" && <Link href={routes.leadServices()} className="btn" prefetch={false}>Hiring services</Link>}
              {viewer && <Link href={routes.savedLeads()} className="btn" prefetch={false}>Saved leads</Link>}
              <Link href={routes.leadNew()} className="btn btn-primary">
                <Plus size={14} /> Draft a lead
              </Link>
            </>
          }
        />
      }
      aside={
        <>
          <Widget title="Board health">
            <dl className="num grid grid-cols-2 gap-2 text-center">
              <div className="rounded bg-sunken p-2">
                <dd className="text-[18px] font-semibold">{stats.open}</dd>
                <dt className="eyebrow">open</dt>
              </div>
              <div className="rounded bg-sunken p-2">
                <dd className="text-[18px] font-semibold text-verdigris">{Number(stats.verified ?? 0)}</dd>
                <dt className="eyebrow">verified</dt>
              </div>
            </dl>
          </Widget>
          <Widget title="By discipline">
            <ul className="space-y-1 text-[12.5px]">
              {LEAD_CATEGORIES.map((c) => (
                <li key={c} className="flex items-center justify-between">
                  <span className="text-ink-2">{c}</span>
                  <span className="num text-ink-3">{catMap.get(c) ?? 0}</span>
                </li>
              ))}
            </ul>
          </Widget>
          <Widget title="Anti-fraud">
            <p className="text-[12.5px] text-ink-2">Every lead passes an automated scam filter (deposit requests, off-platform contact, link spam). Report anything that smells wrong — reports go straight to the mod queue.</p>
          </Widget>
        </>
      }
    >
      {sponsored && (
        <section aria-labelledby="sponsored-lead-heading" className="border-b border-line px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gold/40 bg-sunken/40 p-3.5">
            <div className="min-w-0">
              <p id="sponsored-lead-heading" className="eyebrow flex items-center gap-1.5 text-ink-2"><Megaphone size={14} aria-hidden="true" /> Sponsored lead</p>
              <h2 className="mt-1.5 break-words text-[15px] font-semibold"><Link href={routes.lead(sponsored.id, sponsored.slug)} className="hover:underline">{sponsored.title}</Link></h2>
              <p className="mt-1 text-[12px] text-ink-3">{sponsored.category} · <span className="num">{formatBudget(sponsored.budgetMin, sponsored.budgetMax, sponsored.currency, sponsored.budgetUnit)}</span></p>
              <p className="mt-1 text-[12px] text-ink-3">Paid placement. It doesn’t change organic results.</p>
            </div>
          </div>
        </section>
      )}
      <LeadFeed initialPage={initialPage} viewerId={viewerId} filters={filters} filterError={filterError} />
    </PageFrame>
  );
}
