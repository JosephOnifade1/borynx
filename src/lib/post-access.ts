import { and, eq, exists, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { memberships, posts, spaces, type User } from "@/db/schema";
import { HttpError } from "./errors";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PostViewer = Pick<User, "id" | "role">;

export function parsePostId(value: string | undefined): number | null {
  if (!value || !/^\d{1,10}$/.test(value)) return null;
  const id = Number(value);
  return id > 0 && id <= 2_147_483_647 ? id : null;
}

/** Staff removal and author deletion are independent. Neither belongs in discovery. */
export const activePost = and(eq(posts.isRemoved, false), isNull(posts.authorDeletedAt));

/** Public and restricted threads are readable; private threads require membership or staff access. */
export function postSpaceAccess(viewer: PostViewer | null) {
  if (viewer && viewer.role !== "member") return undefined;
  const member = viewer ? exists(db.select({ id: memberships.spaceId }).from(memberships)
    .where(and(eq(memberships.spaceId, spaces.id), eq(memberships.userId, viewer.id)))) : undefined;
  return or(ne(spaces.privacy, "private"), member);
}

/** Competing changes (including deletion) serialize on the post row. */
export async function lockOpenPost(tx: Transaction, id: number, viewer: PostViewer) {
  const [row] = await tx.select({
    post: { id: posts.id, title: posts.title, slug: posts.slug, authorId: posts.authorId, spaceId: posts.spaceId, solutionCommentId: posts.solutionCommentId },
    spaceSlug: spaces.slug,
  }).from(posts)
    .innerJoin(spaces, eq(spaces.id, posts.spaceId))
    .where(and(eq(posts.id, id), activePost, postSpaceAccess(viewer)))
    .limit(1).for("update", { of: posts });
  if (!row) throw new HttpError(404, "Thread not found or closed", "not_found");
  return row;
}
