import { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { modActions, users } from "@/db/schema";
import { handler, num, oneOf, readJson } from "@/lib/api";
import { HttpError, requireStaff } from "@/lib/auth";
import { evaluateBadges } from "@/lib/services";

export const dynamic = "force-dynamic";

/** PATCH { action: warn | suspend | ban | unban | verify, reason?, days? } */
export const PATCH = handler(async (req: NextRequest, { params }) => {
  const actor = await requireStaff();
  const targetId = num(params.id);
  const body = await readJson<{ action?: string; reason?: string; days?: number }>(req);
  const action = oneOf(body.action, ["warn", "suspend", "ban", "unban", "verify"] as const, "action");
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (!target) throw new HttpError(404, "User not found");
  if (target.id === actor.id) throw new HttpError(400, "You cannot moderate yourself");
  if (target.role === "admin" && actor.role !== "admin") throw new HttpError(403, "Only admins can act on admins");

  await db.transaction(async (tx) => {
    switch (action) {
      case "warn":
        await tx.update(users).set({ warningCount: sql`${users.warningCount} + 1` }).where(eq(users.id, targetId));
        break;
      case "suspend": {
        const days = Math.min(Math.max(Number(body.days) || 7, 1), 90);
        await tx
          .update(users)
          .set({ isBanned: true, bannedAt: new Date(), banExpiresAt: new Date(Date.now() + days * 86_400_000), banReason: reason || `Temporary suspension (${days}d)` })
          .where(eq(users.id, targetId));
        break;
      }
      case "ban":
        await tx.update(users).set({ isBanned: true, bannedAt: new Date(), banExpiresAt: null, banReason: reason || "Permanent ban" }).where(eq(users.id, targetId));
        break;
      case "unban":
        await tx.update(users).set({ isBanned: false, bannedAt: null, banExpiresAt: null, banReason: null }).where(eq(users.id, targetId));
        break;
      case "verify":
        await tx.update(users).set({ isVerified: true }).where(eq(users.id, targetId));
        break;
    }
    await tx.insert(modActions).values({ moderatorId: actor.id, targetUserId: targetId, action, reason });
  });
  if (action === "verify") await evaluateBadges(targetId);
  return Response.json({ ok: true });
});
