import { NextRequest } from "next/server";
import { handler } from "@/lib/api";
import { buildCookie, destroySession, getSession, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Revokes the session row in Postgres (so the token is dead everywhere) and clears the cookie. */
export const POST = handler(async (req: NextRequest) => {
  const session = await getSession();
  if (session) await destroySession(session.token);
  const res = Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  res.headers.append("Set-Cookie", buildCookie(req, SESSION_COOKIE, "", 0));
  return res;
});
