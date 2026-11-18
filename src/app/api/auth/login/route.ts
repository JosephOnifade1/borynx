import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { handler, readJson } from "@/lib/api";
import { buildCookie, createDemoSession, getDemoAccountMode, HttpError, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth";
import { isDemoAccountAllowed, normalizeDemoHandle } from "@/lib/demo-personas";

export const dynamic = "force-dynamic";

const login = handler(async (req) => {
  const body = await readJson<{ username?: unknown; create?: boolean }>(req);
  const username = normalizeDemoHandle(body?.username);
  if (!username) throw new HttpError(400, "Enter a valid handle", "bad_request");
  if (body.create) throw new HttpError(400, "Choose an existing demo account", "bad_request");
  if (!isDemoAccountAllowed(await getDemoAccountMode(), username)) throw new HttpError(404, "Demo account not found", "not_found");

  const [user] = await db.select({ id: users.id, username: users.username, isBanned: users.isBanned, banExpiresAt: users.banExpiresAt })
    .from(users).where(eq(users.username, username)).limit(1);
  if (!user) throw new HttpError(404, "Demo account not found", "not_found");

  const { token, expiresAt } = await createDemoSession(user, req.headers.get("user-agent") ?? "");
  const res = Response.json({ ok: true, user: { id: user.id, username: user.username }, token, expiresAt: expiresAt.toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
  res.headers.append("Set-Cookie", buildCookie(req, SESSION_COOKIE, token, SESSION_TTL_SECONDS));
  return res;
});

export async function POST(req: NextRequest, context: Parameters<typeof login>[1]): Promise<Response> {
  if (await getDemoAccountMode() === "disabled") {
    return Response.json({ error: "Sign-in is unavailable", code: "not_found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  return login(req, context);
}
