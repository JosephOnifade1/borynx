import { asc, inArray } from "drizzle-orm";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { EmailLinkForm } from "@/components/auth/EmailLinkForm";
import { LoginForm } from "@/components/forms";
import { PageFrame, PageHeader } from "@/components/PageFrame";
import { getCurrentUser, getDemoAccountMode, isSuspended } from "@/lib/auth";
import { DEMO_HANDLES, isDemoAccountAllowed } from "@/lib/demo-personas";
import { emailAuthConfig, isAuthHost } from "@/lib/email-auth/policy";
import { safeDestination } from "@/lib/safe-destination";

export const metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; link?: string }> }) {
  const { next, link } = await searchParams;
  const mode = await getDemoAccountMode();
  const destination = safeDestination(next);
  if (mode === "disabled") {
    const config = emailAuthConfig();
    if (config && isAuthHost(config, await headers())) {
      const retry = link === "retry";
      if (!retry && await getCurrentUser()) redirect(destination);
      return (
        <PageFrame header={<PageHeader eyebrow="Access" title="Sign in to Borynx" description={retry
          ? "This link could not sign you in. It may have expired, been used, or been opened in a different browser. Request a fresh link and use the browser you started in."
          : "Sign in with a short-lived link instead of a password."} />}>
          {config.canSend ? <EmailLinkForm mode="login" destination={destination} /> : <p role="status" className="px-5 py-6 text-[13px]">New sign-in emails are paused.</p>}
        </PageFrame>
      );
    }
    return (
      <PageFrame header={<PageHeader eyebrow="Access" title="Sign-in is unavailable" description="You can still browse public threads and leads." />}>
        <div className="px-5 py-6">
          <Link href="/" className="btn">Back to Borynx</Link>
        </div>
      </PageFrame>
    );
  }

  if (await getCurrentUser()) redirect(destination);
  const existing = mode === "existing";
  const accounts = await db
    .select({
      username: users.username,
      displayName: users.displayName,
      headline: users.headline,
      avatarHue: users.avatarHue,
      role: users.role,
      isVerified: users.isVerified,
      isBanned: users.isBanned,
      banExpiresAt: users.banExpiresAt,
    })
    .from(users)
    .where(existing ? undefined : inArray(users.username, DEMO_HANDLES))
    .orderBy(asc(users.id))
    .limit(15);
  const personas = accounts.filter(({ username }) => isDemoAccountAllowed(mode, username))
    .map(({ isBanned, banExpiresAt, ...account }) => ({ ...account, restricted: isSuspended({ isBanned, banExpiresAt }) }));
  return (
    <PageFrame header={<PageHeader eyebrow="Local demo" title="Sign in to Borynx" description={existing
      ? "Choose or enter an existing handle from this local demo database. Use test data only."
      : "Choose a fictional account to try Borynx. Use test data only."} />}>
      <LoginForm personas={personas} destination={destination} existing={existing} />
    </PageFrame>
  );
}
