import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DatabaseOffline } from "@/components/DatabaseOffline";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/shell/AppShell";
import { ensureDatabase } from "@/db/bootstrap";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo-mode";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Borynx", template: "%s · Borynx" },
  description: "The professional network and lead marketplace for tech freelancers — software engineering, web & mobile, DevOps, design, security, data, AI/ML, product, and consulting.",
};

// Apply the current theme before paint. Demo transport is installed by the demo provider.
const themeScript = `(function(){var d=document.documentElement;try{var t=null;try{t=localStorage.getItem('bx-theme')}catch(e){}if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}if(t==='dark'){d.classList.add('dark')}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const demoMode = isDemoMode();
  const status = await ensureDatabase();
  const user = status.ok ? await getCurrentUser().catch(() => null) : null;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        {status.ok ? (
          // Reset cached private data on account changes. This also lets a demo header session
          // replace an initially signed-out 404 after the client refreshes with credentials.
          <Providers key={user?.id ?? "guest"} user={user ? toPublicUser(user) : null} demoMode={demoMode}>
            <AppShell user={user}>{children}</AppShell>
          </Providers>
        ) : (
          <DatabaseOffline status={status} showDiagnostics={demoMode} />
        )}
      </body>
    </html>
  );
}
