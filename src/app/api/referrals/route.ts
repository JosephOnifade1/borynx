import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { referrals } from "@/db/schema";
import { handler, readJson } from "@/lib/api";
import { buildCookie, getCurrentUser, REFERRAL_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Persists an inbound share landing. Idempotent per (shareId, visitorKey). */
export const POST = handler(async (req: NextRequest) => {
  const body = await readJson<{ refId?: number | null; shareId?: string; landingPath?: string; visitorKey?: string }>(req);
  const shareId = typeof body.shareId === "string" ? body.shareId.slice(0, 32) : "";
  const visitorKey = typeof body.visitorKey === "string" ? body.visitorKey.slice(0, 64) : "";
  if (!shareId || !visitorKey) return Response.json({ ok: false }, { status: 400 });
  const refId = Number.isInteger(Number(body.refId)) && Number(body.refId) > 0 ? Number(body.refId) : null;
  const landingPath = typeof body.landingPath === "string" ? body.landingPath.slice(0, 255) : "/";

  const viewer = await getCurrentUser();
  const [existing] = await db.select({ id: referrals.id }).from(referrals).where(and(eq(referrals.shareId, shareId), eq(referrals.visitorKey, visitorKey))).limit(1);
  if (!existing) {
    await db.insert(referrals).values({
      refUserId: refId,
      shareId,
      landingPath,
      visitorKey,
      convertedUserId: viewer && viewer.id !== refId ? viewer.id : null,
      convertedAt: viewer && viewer.id !== refId ? new Date() : null,
    });
  }
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", buildCookie(req, REFERRAL_COOKIE, shareId, 60 * 60 * 24 * 14, false));
  return res;
});
