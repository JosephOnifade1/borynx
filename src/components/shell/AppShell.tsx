import { desc, eq } from "drizzle-orm";
import type { ReactNode } from "react";
import { db } from "@/db";
import { memberships, spaces } from "@/db/schema";
import { RegionErrorBoundary } from "@/components/primitives";
import { CommandPalette } from "./CommandPalette";
import { Header } from "./Header";
import { ReportModal } from "./ReportModal";
import { Sidebar, type SidebarSpace } from "./Sidebar";
import { MobileNav } from "./MobileNav";

async function loadSidebarSpaces(userId: number | null): Promise<SidebarSpace[]> {
  if (userId === null) {
    const rows = await db.select({ slug: spaces.slug, name: spaces.name, accentHue: spaces.accentHue }).from(spaces).orderBy(desc(spaces.memberCount)).limit(6);
    return rows.map((r) => ({ ...r, modRole: null }));
  }
  const rows = await db
    .select({ slug: spaces.slug, name: spaces.name, accentHue: spaces.accentHue, modRole: memberships.modRole })
    .from(memberships)
    .innerJoin(spaces, eq(spaces.id, memberships.spaceId))
    .where(eq(memberships.userId, userId))
    .orderBy(spaces.slug);
  return rows;
}

export async function AppShell({ userId, children }: { userId: number | null; children: ReactNode }) {
  const sidebarSpaces = await loadSidebarSpaces(userId);
  return (
    <>
      <RegionErrorBoundary region="header" compact>
        <Header />
      </RegionErrorBoundary>
      <div className="flex min-h-screen pt-[var(--header-h)]">
        <RegionErrorBoundary region="sidebar" compact>
          <Sidebar spaces={sidebarSpaces} />
        </RegionErrorBoundary>
        <div className="min-w-0 flex-1">
          <MobileNav />
          {children}
        </div>
      </div>
      <CommandPalette />
      <ReportModal />
    </>
  );
}
