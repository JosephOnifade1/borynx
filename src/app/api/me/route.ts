import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { handler, readJson } from "@/lib/api";
import { getSession, HttpError, isSuspended, requireActor, restrictionMessage, toPublicUser } from "@/lib/auth";
import { parseProfilePatch, toProfilePreferences } from "@/lib/profile-input";

export const dynamic = "force-dynamic";

/** Session probe — lets the client verify which transport (cookie / header) actually works. */
export const GET = handler(async () => {
  const session = await getSession();
  return Response.json(
    { user: session ? toPublicUser(session.user) : null, transport: session?.transport ?? "none" },
    { headers: { "Cache-Control": "no-store" } },
  );
});

export const PATCH = handler(async (req: NextRequest) => {
  const actor = await requireActor();
  const body = await readJson(req);
  const updated = await db.transaction(async (tx) => {
    // Concurrent partial rate changes must merge with the latest amount/currency pair.
    const [current] = await tx.select().from(users).where(eq(users.id, actor.id)).limit(1).for("update");
    if (!current) throw new HttpError(401, "Sign in to continue", "unauthenticated");
    if (isSuspended(current)) throw new HttpError(403, restrictionMessage(current), "restricted");
    const patch = parseProfilePatch(body, current);
    if (Object.keys(patch).length === 0) return current;
    const [row] = await tx.update(users).set(patch).where(eq(users.id, actor.id)).returning();
    return row;
  });

  return Response.json(
    { ok: true, user: { ...toPublicUser(updated), ...toProfilePreferences(updated) } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});
