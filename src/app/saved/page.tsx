import Link from "next/link";
import { redirect } from "next/navigation";
import { PostFeed } from "@/components/feed/PostFeed";
import { SavedLeadFeed } from "@/components/leads/LeadFeed";
import { PageFrame, PageHeader } from "@/components/PageFrame";
import { getCurrentUser } from "@/lib/auth";
import { listSavedLeads } from "@/lib/lead-feed";
import { listPosts } from "@/lib/queries";
import { isRankMode } from "@/lib/sorting";
import { cn, routes } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved", robots: { index: false, follow: false } };

export default async function SavedPage({ searchParams }: { searchParams: Promise<{ tab?: string; sort?: string }> }) {
  const [user, { sort, tab }] = await Promise.all([getCurrentUser(), searchParams]);
  const leadsTab = tab === "leads";
  if (!user) redirect(`${routes.login()}?next=${leadsTab ? encodeURIComponent(routes.savedLeads()) : routes.saved()}`);
  const mode = isRankMode(sort) ? sort : "new";
  const initialLeads = leadsTab ? await listSavedLeads(user.id) : null;
  const initialThreads = leadsTab ? null : await listPosts({ mode, savedBy: user.id, viewer: user });
  return (
    <PageFrame stream header={<PageHeader eyebrow="Library" title={leadsTab ? "Saved leads" : "Saved threads"} description="Private to you. Revisit leads and threads you’ve bookmarked." />}>
      <nav aria-label="Saved items" className="panel mb-3 flex items-center gap-1 rounded-lg px-2">
        {[{ label: "Threads", href: routes.saved(), active: !leadsTab }, { label: "Leads", href: routes.savedLeads(), active: leadsTab }].map(({ label, href, active }) => (
          <Link key={label} href={href} prefetch={false} aria-current={active ? "page" : undefined}
            className={cn("flex h-10 items-center border-b-2 px-3 text-[13px] font-semibold", active ? "border-ember text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
            {label}
          </Link>
        ))}
      </nav>
      {initialLeads && <SavedLeadFeed initialPage={initialLeads} viewerId={user.id} />}
      {initialThreads && <PostFeed saved initialMode={mode} initialPage={initialThreads} emptyTitle="Nothing saved" emptyHint="Hit Save on any thread to keep it here." />}
    </PageFrame>
  );
}
