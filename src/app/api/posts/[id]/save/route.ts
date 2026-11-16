import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { saves } from "@/db/schema";
import { handler, num } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const POST = handler(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const postId = num(params.id);
  const [existing] = await db.select().from(saves).where(and(eq(saves.userId, user.id), eq(saves.postId, postId))).limit(1);
  if (existing) {
    await db.delete(saves).where(and(eq(saves.userId, user.id), eq(saves.postId, postId)));
    return Response.json({ saved: false });
  }
  await db.insert(saves).values({ userId: user.id, postId }).onConflictDoNothing();
  return Response.json({ saved: true });
});
