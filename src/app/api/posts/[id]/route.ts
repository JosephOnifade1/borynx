import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { comments, notifications, posts, reports, spaces } from "@/db/schema";
import { handler, readJson, str } from "@/lib/api";
import { HttpError, requireActor, requireUser } from "@/lib/auth";
import { activePost, parsePostId, postSpaceAccess } from "@/lib/post-access";
import { fileAutoReport, screenContent, type Executor } from "@/lib/services";
import { routes } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function preserveReportEvidence(tx: Executor, post: Pick<typeof posts.$inferSelect, "id" | "title" | "body">) {
  await tx.update(reports).set({ postSnapshot: { title: post.title, body: post.body } }).where(and(
    eq(reports.targetType, "post"), eq(reports.targetId, post.id), isNull(reports.postSnapshot),
  ));
}

/** PATCH { title, body?, editedAt } — missing body keeps the existing Markdown byte for byte. */
export const PATCH = handler(async (req, { params }) => {
  const actor = await requireActor();
  const id = parsePostId(params.id);
  if (id === null) throw new HttpError(404, "Thread not found", "not_found");
  const input = await readJson<{ title?: string; body?: string; editedAt?: string | null }>(req);
  if (!input || (input.editedAt !== null && typeof input.editedAt !== "string")) {
    throw new HttpError(400, "An edit version is required", "bad_request");
  }
  const title = str(input.title, "title", { min: 8, max: 180 });
  const body = input.body === undefined ? undefined : str(input.body, "body", { min: 1, max: 20_000 });

  return db.transaction(async (tx) => {
    const [row] = await tx.select({ post: posts, spaceSlug: spaces.slug }).from(posts)
      .innerJoin(spaces, eq(spaces.id, posts.spaceId))
      .where(and(eq(posts.id, id), eq(posts.authorId, actor.id), activePost, postSpaceAccess(actor)))
      .limit(1).for("update", { of: posts });
    if (!row) throw new HttpError(404, "Editable thread not found", "not_found");
    const { post, spaceSlug } = row;
    const href = routes.post(spaceSlug, post.id, post.slug);
    if (input.editedAt !== (post.editedAt?.toISOString() ?? null)) {
      throw new HttpError(409, "This post has changed since you opened it. Copy your edits before reloading.", "edit_conflict");
    }
    const content = body ?? post.body;
    if (title === post.title && content === post.body) {
      return Response.json({ href, flagged: false, changed: false });
    }

    const verdict = screenContent(`${title}\n${content}`);
    const editedAt = new Date(Math.max(Date.now(), (post.editedAt?.getTime() ?? 0) + 1));
    await preserveReportEvidence(tx, post);
    await tx.update(posts).set({ title, body: content, editedAt }).where(eq(posts.id, id));
    await fileAutoReport(tx, "post", id, post.spaceId, verdict);
    return Response.json({ href, flagged: verdict.needsReview, changed: true, editedAt: editedAt.toISOString() });
  });
});

/** DELETE withdraws only the author's text. Keep the thread ID and all replies. */
export const DELETE = handler(async (_req, { params }) => {
  // Withdrawing existing text does not require permission to publish new content.
  const actor = await requireUser();
  const id = parsePostId(params.id);
  if (id === null) throw new HttpError(404, "Thread not found", "not_found");

  return db.transaction(async (tx) => {
    const [row] = await tx.select({ post: posts, spaceSlug: spaces.slug }).from(posts)
      .innerJoin(spaces, eq(spaces.id, posts.spaceId))
      .where(and(eq(posts.id, id), eq(posts.authorId, actor.id)))
      .limit(1).for("update", { of: posts });
    if (!row) throw new HttpError(404, "Thread not found", "not_found");
    const { post, spaceSlug } = row;
    const href = routes.post(spaceSlug, id, "deleted");
    if (!post.authorDeletedAt) {
      await preserveReportEvidence(tx, post);
      await tx.update(posts).set({ authorDeletedAt: new Date(), title: "Deleted post", body: "", slug: "deleted" }).where(eq(posts.id, id));

      // Reply and solution notifications store copies of the old title and permalink.
      const replies = tx.select({ id: comments.id }).from(comments).where(eq(comments.postId, id));
      await tx.update(notifications).set({ message: "Activity on a deleted post.", href }).where(or(
        and(eq(notifications.entityType, "post"), eq(notifications.entityId, id)),
        and(eq(notifications.entityType, "comment"), inArray(notifications.entityId, replies)),
      ));
    }
    return Response.json({ ok: true, href });
  });
});
