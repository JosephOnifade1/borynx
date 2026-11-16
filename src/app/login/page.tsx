import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { LoginForm } from "@/components/forms";
import { PageFrame, PageHeader } from "@/components/PageFrame";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const current = await getCurrentUser();
  const { next } = await searchParams;
  if (current) redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
  const personas = await db
    .select({ username: users.username, displayName: users.displayName, headline: users.headline, avatarHue: users.avatarHue, role: users.role, isVerified: users.isVerified, isBanned: users.isBanned })
    .from(users)
    .orderBy(asc(users.id))
    .limit(8);
  return (
    <PageFrame header={<PageHeader eyebrow="Access" title="Sign in to Borynx" description="Sessions are cookie-based in this sandbox. Verification and roles flow through the same moderation tables a production OAuth flow would use." />}>
      <LoginForm personas={personas} next={next} />
    </PageFrame>
  );
}
