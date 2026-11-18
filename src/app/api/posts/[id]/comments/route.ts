import { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, posts } from "@/db/schema";
import { handler, num, readJson, str } from "@/lib/api";
import { canModerateSpace, getCurrentUser, HttpError, requireActor } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { lockOpenPost } from "@/lib/post-access";
import { getPostById, listComments } from "@/lib/queries";
import { assertRateLimit, evaluateBadges, fileAutoReport, screenContent } from "@/lib/services";
import { routes } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req: NextRequest, { params }) => {
  const viewer = await getCurrentUser();
  const postId = num(params.id);
  const row = await getPostById(postId, viewer);
  if (!row || (row.post.isRemoved && (!viewer || !(await canModerateSpace(viewer, row.space.id))))) {
    throw new HttpError(404, "Thread not found", "not_found");
  }
  const items = await listComments(postId, viewer?.id ?? null);
  return Response.json({ items });
});

export const POST = handler(async (req: NextRequest, { params }) => {
  const actor = await requireActor();
  const postId = num(params.id);
  const body = await readJson<{ body?: string; parentId?: number | null }>(req);
  const content = str(body.body, "comment", { min: 2, max: 8000 });
  const parentId = typeof body.parentId === "number" ? body.parentId : null;

  await assertRateLimit(actor.id, "comment");
  const verdict = screenContent(content);

  const created = await db.transaction(async (tx) => {
    const { post, spaceSlug } = await lockOpenPost(tx, postId, actor);
    const postHref = routes.post(spaceSlug, post.id, post.slug);
    let parentAuthorId: number | null = null;
    if (parentId !== null) {
      if (!Number.isInteger(parentId) || parentId < 1 || parentId > 2_147_483_647) throw new HttpError(400, "Invalid parent comment");
      const [parent] = await tx.select({ authorId: comments.authorId }).from(comments)
        .where(and(eq(comments.id, parentId), eq(comments.postId, postId))).limit(1);
      if (!parent) throw new HttpError(400, "Reply must belong to this thread");
      parentAuthorId = parent.authorId;
    }
    const [c] = await tx.insert(comments).values({ postId, authorId: actor.id, parentId, body: content }).returning();
    await tx.update(posts).set({ commentCount: sql`${posts.commentCount} + 1` }).where(eq(posts.id, postId));
    await fileAutoReport(tx, "comment", c.id, post.spaceId, verdict);

    // Notify post author
    if (post.authorId !== actor.id) {
      await createNotification(
        {
          userId: post.authorId,
          actorId: actor.id,
          type: "comment_reply",
          entityType: "post",
          entityId: post.id,
          message: `${actor.displayName} replied to your thread: "${post.title}"`,
          href: postHref,
        },
        tx,
      );
    }

    // Notify parent comment author if different from post author
    if (parentAuthorId && parentAuthorId !== actor.id && parentAuthorId !== post.authorId) {
      await createNotification(
        {
          userId: parentAuthorId,
          actorId: actor.id,
          type: "comment_reply",
          entityType: "comment",
          entityId: c.id,
          message: `${actor.displayName} replied to your comment on "${post.title}"`,
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
