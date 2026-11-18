/** Same-origin page navigation only; do not allow a redirect to an API or a network-path URL. */
export function safeDestination(next: unknown): string {
  if (typeof next !== "string" || next.length > 512 || !next.startsWith("/") || next.startsWith("//") || /[\\\s]/.test(next)) return "/";
  const origin = "https://borynx.invalid";
  try {
    const url = new URL(next, origin);
    const path = decodeURIComponent(url.pathname);
    if (url.origin !== origin || !path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /^\/(?:api|_next|login)(?:\/|$)/i.test(path)) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
