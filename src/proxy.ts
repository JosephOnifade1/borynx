import { NextResponse, type NextRequest } from "next/server";

/**
 * Canonical URL resolution for Borynx.
 *
 *  Canonical hierarchy
 *   /b                    spaces directory
 *   /b/:slug              space feed
 *   /b/:slug/submit       new post
 *   /b/:slug/mod          space moderation
 *   /b/:slug/p/:id/:slug  post permalink (community-scoped)
 *   /p/:id                global post permalink → redirects to the scoped canonical
 *   /f/:username          freelancer profile      /me → own profile
 *   /l, /l/new, /l/:id/:slug   marketplace
 *   /mod/queue, /achievements, /login
 *
 *  Everything else below is legacy or malformed and gets 308'd here (cheap, no DB), while
 *  alias/rename resolution that needs the database happens inside the route segments.
 */

const LEGACY_PREFIXES: ReadonlyArray<[RegExp, string]> = [
  [/^\/(?:r|c|s|community|communities|space|spaces)\/([^/]+)(\/.*)?$/i, "/b/$1$2"],
  [/^\/(?:u|user|users|profile|profiles|freelancer|freelancers)\/([^/]+)(\/.*)?$/i, "/f/$1$2"],
  [/^\/(?:leads?|jobs?|bount(?:y|ies)|marketplace|opportunit(?:y|ies))(\/.*)?$/i, "/l$1"],
  [/^\/(?:posts?|threads?|t)\/(\d+)(\/.*)?$/i, "/p/$1"],
  [/^\/(?:communities|spaces|directory)\/?$/i, "/b"],
  [/^\/(?:moderation|moderate|admin)(\/.*)?$/i, "/mod/queue"],
  [/^\/(?:badges|achievements?|trophies)\/?$/i, "/achievements"],
  [/^\/(?:signin|sign-in|auth|account\/login)\/?$/i, "/login"],
  [/^\/(?:profile|me\/profile|account)\/?$/i, "/me"],
];

/** Segments under these roots are case-insensitive identifiers and must be lowercase. */
const LOWERCASE_ROOTS = new Set(["b", "f", "l"]);

export function proxy(req: NextRequest): NextResponse {
  const url = req.nextUrl;
  let pathname = url.pathname;

  if (pathname.startsWith("/api") || pathname.startsWith("/_next") || /\.[a-z0-9]+$/i.test(pathname)) {
    return NextResponse.next();
  }

  let changed = false;

  // 1. Collapse duplicate slashes and strip trailing slash
  const collapsed = pathname.replace(/\/{2,}/g, "/").replace(/(.+?)\/+$/, "$1");
  if (collapsed !== pathname) {
    pathname = collapsed;
    changed = true;
  }

  // 2. Legacy prefixes
  for (const [pattern, replacement] of LEGACY_PREFIXES) {
    if (pattern.test(pathname)) {
      const next = pathname.replace(pattern, replacement).replace(/(.+?)\/+$/, "$1");
      if (next !== pathname) {
        pathname = next;
        changed = true;
      }
      break;
    }
  }

  // 3. Lowercase identifier segments (/B/Logistics-Ops → /b/logistics-ops)
  const segments = pathname.split("/");
  if (segments.length > 1) {
    const root = segments[1].toLowerCase();
    if (LOWERCASE_ROOTS.has(root) || root === "me" || root === "p" || root === "mod") {
      if (segments[1] !== root) {
        segments[1] = root;
        changed = true;
      }
      if (segments[2] && segments[2] !== "new" && root !== "p") {
        const lowered = decodeURIComponent(segments[2]).toLowerCase();
        if (lowered !== segments[2]) {
          segments[2] = lowered;
          changed = true;
        }
      }
      pathname = segments.join("/");
    }
  }

  if (changed) {
    const target = url.clone();
    target.pathname = pathname || "/";
    return NextResponse.redirect(target, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
