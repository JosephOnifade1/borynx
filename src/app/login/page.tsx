import { asc, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { LoginForm } from "@/components/forms";
import { PageFrame, PageHeader } from "@/components/PageFrame";
import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo-mode";
import { DEMO_HANDLES } from "@/lib/demo-personas";

export const metadata = { title: "Sign in" };

function safeDestination(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  const origin = "https://borynx.invalid";
  const url = new URL(next, origin);
  return url.origin === origin && !url.pathname.startsWith("//") ? `${url.pathname}${url.search}${url.hash}` : "/";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!isDemoMode()) {
    return (
      <PageFrame header={<PageHeader eyebrow="Access" title="Sign-in is unavailable" description="You can still browse public threads and leads." />}>
        <div className="px-5 py-6">
          <Link href="/" className="btn">Back to Borynx</Link>
        </div>
      </PageFrame>
    );
  }

  const destination = safeDestination((await searchParams).next);
  if (await getCurrentUser()) redirect(destination);
  const personas = await db
    .select({ username: users.username, displayName: users.displayName, headline: users.headline, avatarHue: users.avatarHue, role: users.role, isVerified: users.isVerified, isBanned: users.isBanned })
    .from(users).where(inArray(users.username, DEMO_HANDLES)).orderBy(asc(users.id));
  return (
    <PageFrame header={<PageHeader eyebrow="Local demo" title="Sign in to Borynx" description="Choose a fictional account to try Borynx. Use test data only." />}>
      <LoginForm personas={personas} destination={destination} />
    </PageFrame>
  );
}
