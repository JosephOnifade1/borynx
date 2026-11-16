import { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, posts, spaces } from "@/db/schema";
import { handler, num, readJson, str } from "@/lib/api";
import { getCurrentUser, HttpError, requireActor } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { listComments } from "@/lib/queries";
import { assertRateLimit, evaluateBadges, fileAutoReport, screenContent } from "@/lib/services";
import { routes } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req: NextRequest, { params }) => {
  const viewer = await getCurrentUser();
  const items = await listComments(num(params.id), viewer?.id ?? null);
  return Response.json({ items });
});

export const POST = handler(async (req: NextRequest, { params }) => {
  const actor = await requireActor();
  const postId = num(params.id);
  const body = await readJson<{ body?: string; parentId?: number | null }>(req);
  const content = str(body.body, "comment", { min: 2, max: 8000 });
  const parentId = typeof body.parentId === "number" ? body.parentId : null;

  const [postWithSpace] = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      authorId: posts.authorId,
      spaceId: posts.spaceId,
      spaceSlug: spaces.slug,
      isRemoved: posts.isRemoved,
    })
    .from(posts)
    .innerJoin(spaces, eq(spaces.id, posts.spaceId))
    .where(eq(posts.id, postId))
    .limit(1);

  if (!postWithSpace || postWithSpace.isRemoved) throw new HttpError(404, "Thread not found", "not_found");

  await assertRateLimit(actor.id, "comment");
  const verdict = screenContent(content);

  const postHref = routes.post(postWithSpace.spaceSlug, postWithSpace.id, postWithSpace.slug);

  let parentAuthorId: number | null = null;
  if (parentId) {
    const [p] = await db.select({ authorId: comments.authorId }).from(comments).where(eq(comments.id, parentId)).limit(1);
    if (p) parentAuthorId = p.authorId;
  }

  const created = await db.transaction(async (tx) => {
    const [c] = await tx.insert(comments).values({ postId, authorId: actor.id, parentId, body: content }).returning();
    await tx.update(posts).set({ commentCount: sql`${posts.commentCount} + 1` }).where(eq(posts.id, postId));
    await fileAutoReport(tx, "comment", c.id, postWithSpace.spaceId, verdict);

    // Notify post author
    if (postWithSpace.authorId !== actor.id) {
      await createNotification(
        {
          userId: postWithSpace.authorId,
          actorId: actor.id,
          type: "comment_reply",
          entityType: "post",
          entityId: postWithSpace.id,
          message: `${actor.displayName} replied to your thread: "${postWithSpace.title}"`,
          href: postHref,
        },
        tx,
      );
    }

    // Notify parent comment author if different from post author
    if (parentAuthorId && parentAuthorId !== actor.id && parentAuthorId !== postWithSpace.authorId) {
      await createNotification(
        {
          userId: parentAuthorId,
          actorId: actor.id,
          type: "comment_reply",
          entityType: "comment",
          entityId: c.id,
          message: `${actor.displayName} replied to your comment on "${postWithSpace.title}"`,
          href: postHref,
        },
        tx,
      );
    }

    return c;
  });
  const newBadges = await evaluateBadges(actor.id);
  return Response.json({ id: created.id, newBadges: newBadges.map((b) => b.name), flagged: verdict.needsReview }, { status: 201 });
});
