import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { modActions, users } from "@/db/schema";
import { handler, readJson } from "@/lib/api";
import { getDemoAccountMode, HttpError, requireActor } from "@/lib/auth";
import { evaluateBadges } from "@/lib/services";

export const dynamic = "force-dynamic";

/** URL-only verification is a demo affordance, not proof of GitHub ownership. */
export const POST = handler(async (req: NextRequest) => {
  if (await getDemoAccountMode() === "disabled") throw new HttpError(404, "Verification is unavailable", "not_found");
  const actor = await requireActor();
  const body = await readJson<{ githubUrl?: string; portfolioUrl?: string }>(req);
  const githubUrl = typeof body.githubUrl === "string" ? body.githubUrl.trim() : "";
  if (!/^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/?$/.test(githubUrl)) throw new HttpError(400, "Enter a valid GitHub profile URL (https://github.com/handle)");
  const portfolioUrl = typeof body.portfolioUrl === "string" && /^https?:\/\/\S+$/.test(body.portfolioUrl.trim()) ? body.portfolioUrl.trim() : null;

  await db.transaction(async (tx) => {
    await tx.update(users).set({ isVerified: true, githubUrl, portfolioUrl: portfolioUrl ?? actor.portfolioUrl }).where(eq(users.id, actor.id));
    await tx.insert(modActions).values({ moderatorId: null, targetUserId: actor.id, action: "verify", reason: `GitHub verification: ${githubUrl}` });
  });
  const fresh = await evaluateBadges(actor.id);
  return Response.json({ ok: true, newBadges: fresh.map((b) => b.name) });
});
