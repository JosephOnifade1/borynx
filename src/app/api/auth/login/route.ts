import { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { referrals, users } from "@/db/schema";
import { handler, readJson, str } from "@/lib/api";
import { buildCookie, createSession, HttpError, REFERRAL_COOKIE, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth";
import { evaluateBadges } from "@/lib/services";

export const dynamic = "force-dynamic";

interface LoginBody extends Record<string, unknown> {
  username?: string;
  create?: boolean;
  displayName?: string;
  referral?: { shareId?: string; refId?: number | null } | null;
}

export const POST = handler(async (req: NextRequest) => {
  const body = await readJson<LoginBody>(req);
  const username = str(body.username, "handle", { min: 2, max: 34 })
    .toLowerCase()
    .replace(/^[fu]\//, "");
  if (!/^[a-z0-9][a-z0-9_.-]{1,31}$/.test(username)) throw new HttpError(400, "Handles are 2–32 characters: letters, numbers, . _ -");

  let [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user) {
    if (!body.create) throw new HttpError(404, `No account with the handle f/${username} — switch to “Create account”.`, "not_found");
    const displayName = typeof body.displayName === "string" && body.displayName.trim() ? body.displayName.trim().slice(0, 80) : username;
    [user] = await db
      .insert(users)
      .values({ username, displayName, avatarHue: Math.floor(Math.random() * 360), skills: [] })
      .returning();
    // Convert any pending share attribution for this visitor.
    const shareId = body.referral?.shareId ?? req.cookies.get(REFERRAL_COOKIE)?.value ?? null;
    if (shareId) {
      await db
        .update(referrals)
        .set({ convertedUserId: user.id, convertedAt: new Date() })
        .where(and(eq(referrals.shareId, shareId), isNull(referrals.convertedUserId)));
    }
    await evaluateBadges(user.id);
  } else if (body.create) {
    throw new HttpError(409, `f/${username} is already taken — sign in instead, or pick another handle.`, "conflict");
  }

  const { token, expiresAt } = await createSession(user.id, req.headers.get("user-agent") ?? "");
  // The token is returned in the body too: if the browser drops the cookie (embedded preview),
  // the client falls back to sending it as the x-bx-session header.
  const res = Response.json(
    { ok: true, user: { id: user.id, username: user.username }, token, expiresAt: expiresAt.toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
  res.headers.append("Set-Cookie", buildCookie(req, SESSION_COOKIE, token, SESSION_TTL_SECONDS));
  return res;
});
