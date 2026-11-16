import { and, count, eq, sql, sum } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { LeadFeed } from "@/components/leads/LeadFeed";
import { PageFrame, PageHeader, Widget } from "@/components/PageFrame";
import { getCurrentUser } from "@/lib/auth";
import { LEAD_CATEGORIES } from "@/lib/constants";
import { listLeads } from "@/lib/queries";
import { routes } from "@/lib/utils";

export const metadata = { title: "Leads" };

export default async function LeadsPage() {
  const viewer = await getCurrentUser();
  const [[stats], byCategory, initialPage] = await Promise.all([
    db.select({ open: count(), verified: sql<number>`count(*) filter (where ${leads.isVerified})`, budget: sum(leads.budgetMax) }).from(leads).where(and(eq(leads.isRemoved, false), eq(leads.status, "open"))),
    db.select({ category: leads.category, c: count() }).from(leads).where(and(eq(leads.isRemoved, false), eq(leads.status, "open"))).groupBy(leads.category),
    listLeads({ mode: "new", viewerId: viewer?.id ?? null }),
  ]);
  const catMap = new Map(byCategory.map((r) => [r.category, r.c]));
  return (
    <PageFrame
      stream
      header={
        <PageHeader
          eyebrow="Marketplace"
          title="Leads & bounties"
          description="Contracts, bounties, and roles across every tech discipline. Verified leads come from Verified Pros or have been vetted by a moderator. Canonical path: /l/:id/:slug."
          actions={
            <Link href={routes.leadNew()} className="btn btn-primary">
              <Plus size={14} /> Post a lead
            </Link>
          }
        />
      }
      aside={
        <>
          <Widget title="Board health">
            <dl className="num grid grid-cols-3 gap-2 text-center">
              <div className="rounded bg-sunken p-2">
                <dd className="text-[18px] font-semibold">{stats.open}</dd>
                <dt className="eyebrow">open</dt>
              </div>
              <div className="rounded bg-sunken p-2">
                <dd className="text-[18px] font-semibold text-verdigris">{Number(stats.verified ?? 0)}</dd>
                <dt className="eyebrow">verified</dt>
              </div>
              <div className="rounded bg-sunken p-2">
                <dd className="text-[18px] font-semibold">${Math.round(Number(stats.budget ?? 0) / 1000)}k</dd>
                <dt className="eyebrow">on board</dt>
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
      <LeadFeed initialPage={initialPage} />
    </PageFrame>
  );
}
