import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { handler, readJson, str } from "@/lib/api";
import { buildCookie, createDemoSession, HttpError, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";

const login = handler(async (req) => {
  const body = await readJson<{ username?: string; create?: boolean }>(req);
  const username = str(body?.username, "handle", { min: 2, max: 34 }).toLowerCase().replace(/^[fu]\//, "");

  const [user] = await db
    .select({ id: users.id, username: users.username, isBanned: users.isBanned })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user) throw new HttpError(404, "Account not found", "not_found");
  if (user.isBanned) throw new HttpError(403, "Account is suspended", "forbidden");

  const { token, expiresAt } = await createDemoSession(user.id, req.headers.get("user-agent") ?? "");
  const res = Response.json({ ok: true, user, token, expiresAt: expiresAt.toISOString() }, { headers: { "Cache-Control": "no-store" } });
  res.headers.append("Set-Cookie", buildCookie(req, SESSION_COOKIE, token, SESSION_TTL_SECONDS));
  return res;
});

export async function POST(req: NextRequest, context: Parameters<typeof login>[1]): Promise<Response> {
  if (!isDemoMode()) {
    return Response.json({ error: "Sign-in is unavailable", code: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return login(req, context);
}
