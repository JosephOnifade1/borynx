import { handler } from "@/lib/api";
import { readEmailFlow, recipientHash } from "@/lib/email-auth/flow";
import { emailCookie, EMAIL_FLOW_COOKIE, EMAIL_SESSION_COOKIE, EMAIL_SESSION_TTL, requireEmailAuth, type EmailAuthConfig } from "@/lib/email-auth/policy";
import { createEmailSession } from "@/lib/email-auth/session";
import { verifySupabaseCode } from "@/lib/email-auth/supabase";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };

function redirect(config: EmailAuthConfig, path: string) {
  // An explicit empty fragment stops a browser inheriting a provider error/token fragment.
  const location = `${config.origin}${path}${path.includes("#") ? "" : "#"}`;
  return new Response(null, { status: 303, headers: { ...headers, Location: location } });
}

// A HEAD request or explicit prefetch must not redeem even a provider code.
export const HEAD = () => new Response(null, { status: 204, headers });

export const GET = handler(async (req) => {
  const config = requireEmailAuth(req);
  if (/prefetch/i.test(`${req.headers.get("purpose")} ${req.headers.get("sec-purpose")}`)) return new Response(null, { status: 204, headers });
  const retry = () => redirect(config, "/login?link=retry");
  const codes = req.nextUrl.searchParams.getAll("code");
  const flow = readEmailFlow(config, req.cookies.get(EMAIL_FLOW_COOKIE)?.value);
  if (!flow || codes.length !== 1 || !/^[A-Za-z0-9._~-]{1,256}$/.test(codes[0])) return retry();
  const proof = await verifySupabaseCode(config, codes[0], flow.verifier);
  if (!proof || recipientHash(config, proof.email) !== flow.emailHash) return retry();

  // Only authenticate and bind intent. A separate, same-origin POST creates a lead.
  const session = await createEmailSession(config, proof, flow, req.cookies.get(EMAIL_SESSION_COOKIE)?.value);
  if (!session) return retry();
  const response = redirect(config, session.next);
  response.headers.append("Set-Cookie", emailCookie(EMAIL_SESSION_COOKIE, session.token, EMAIL_SESSION_TTL));
  response.headers.append("Set-Cookie", emailCookie(EMAIL_FLOW_COOKIE, "", 0));
  return response;
});
