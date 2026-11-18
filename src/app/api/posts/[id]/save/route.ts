import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { saves } from "@/db/schema";
import { handler, num } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { lockOpenPost } from "@/lib/post-access";

export const dynamic = "force-dynamic";

export const POST = handler(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const postId = num(params.id);
  return db.transaction(async (tx) => {
    await lockOpenPost(tx, postId, user);
    const key = and(eq(saves.userId, user.id), eq(saves.postId, postId));
    const [existing] = await tx.select().from(saves).where(key).limit(1);
    if (existing) {
      await tx.delete(saves).where(key);
      return Response.json({ saved: false });
    }
    await tx.insert(saves).values({ userId: user.id, postId }).onConflictDoNothing();
    return Response.json({ saved: true });
  });
});
