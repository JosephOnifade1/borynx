import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { handler, readJson } from "@/lib/api";
import { getSession, requireActor, toPublicUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Session probe — lets the client verify which transport (cookie / header) actually works. */
export const GET = handler(async () => {
  const session = await getSession();
  return Response.json(
    { user: session ? toPublicUser(session.user) : null, transport: session?.transport ?? "none" },
    { headers: { "Cache-Control": "no-store" } },
  );
});

interface UpdateProfileBody extends Record<string, unknown> {
  displayName?: string;
  headline?: string;
  bio?: string;
  skills?: string[];
  githubUrl?: string | null;
  portfolioUrl?: string | null;
  avatarHue?: number;
}

export const PATCH = handler(async (req: NextRequest) => {
  const actor = await requireActor();
  const body = await readJson<UpdateProfileBody>(req);

  const updates: Partial<typeof users.$inferInsert> = {};

  if (typeof body.displayName === "string") {
    const trimmed = body.displayName.trim();
    if (trimmed.length >= 2 && trimmed.length <= 80) {
      updates.displayName = trimmed;
    }
  }

  if (typeof body.headline === "string") {
    updates.headline = body.headline.trim().slice(0, 140);
  }

  if (typeof body.bio === "string") {
    updates.bio = body.bio.trim().slice(0, 2000);
  }

  if (Array.isArray(body.skills)) {
    updates.skills = body.skills
      .filter((s) => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim().slice(0, 30))
      .slice(0, 20);
  }

  if (body.githubUrl !== undefined) {
    if (!body.githubUrl) {
      updates.githubUrl = null;
    } else {
      const url = body.githubUrl.trim();
      updates.githubUrl = url.startsWith("http") ? url : `https://${url}`;
    }
  }

  if (body.portfolioUrl !== undefined) {
    if (!body.portfolioUrl) {
      updates.portfolioUrl = null;
    } else {
      const url = body.portfolioUrl.trim();
      updates.portfolioUrl = url.startsWith("http") ? url : `https://${url}`;
    }
  }

  if (typeof body.avatarHue === "number") {
    updates.avatarHue = Math.max(0, Math.min(360, Math.round(body.avatarHue)));
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, actor.id))
    .returning();

  return Response.json({
    ok: true,
    user: toPublicUser(updated),
  });
});
