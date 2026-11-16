import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DatabaseOffline } from "@/components/DatabaseOffline";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/shell/AppShell";
import { ensureDatabase } from "@/db/bootstrap";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Borynx", template: "%s · Borynx" },
  description: "The professional network and lead marketplace for tech freelancers — software engineering, web & mobile, DevOps, design, security, data, AI/ML, product, and consulting.",
};

/**
 * Runs before any bundle:
 *  1. Applies the persisted / preferred theme without a flash.
 *  2. Installs a tiny fetch shim: when the session cookie is blocked (embedded preview) and the tab
 *     holds a fallback token, same-origin requests — including Next's RSC navigations — carry it as
 *     the x-bx-session header. Every storage access is guarded; this script can never throw.
 */
const bootScript = `(function(){var d=document.documentElement;try{var t=null;try{t=localStorage.getItem('bx-theme')}catch(e){}if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}if(t==='dark'){d.classList.add('dark')}}catch(e){}try{var f=window.fetch;if(!f||f.__bx)return;var read=function(){var v=null;try{v=localStorage.getItem('bx-token')}catch(e){}if(!v){try{v=sessionStorage.getItem('bx-token')}catch(e){}}return v||window.__bxToken||null};var w=function(input,init){try{var tok=read();if(tok){var url=typeof input==='string'?input:(input&&input.url)?input.url:String(input);if(new URL(url,location.href).origin===location.origin){var h=new Headers((init&&init.headers)||(input&&typeof input==='object'&&input.headers)||undefined);if(!h.has('x-bx-session')){h.set('x-bx-session',tok)}init=Object.assign({},init||{},{headers:h})}}}catch(e){}return f.call(window,input,init)};w.__bx=true;window.fetch=w}catch(e){}})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const status = await ensureDatabase();
  const user = status.ok ? await getCurrentUser().catch(() => null) : null;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="min-h-screen antialiased">
        {status.ok ? (
          <Providers user={user ? toPublicUser(user) : null}>
            <AppShell user={user}>{children}</AppShell>
          </Providers>
        ) : (
          <DatabaseOffline status={status} />
        )}
      </body>
    </html>
  );
}
