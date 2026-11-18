import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, posts, postKindEnum, spaces } from "@/db/schema";
import { handler, readJson, oneOf, str } from "@/lib/api";
import { getCurrentUser, HttpError, requireActor } from "@/lib/auth";
import { listPosts, resolveSpace, resolveUser } from "@/lib/queries";
import { assertRateLimit, evaluateBadges, fileAutoReport, screenContent } from "@/lib/services";
import { isRankMode } from "@/lib/sorting";
import { routes, slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const viewer = await getCurrentUser();
  const modeParam = sp.get("sort");
  const mode = isRankMode(modeParam) ? modeParam : "hot";
  const cursor = Number.parseInt(sp.get("cursor") ?? "0", 10) || 0;

  let spaceId: number | undefined;
  if (sp.get("space")) {
    const resolved = await resolveSpace(sp.get("space") ?? "");
    if (!resolved) return Response.json({ items: [], nextCursor: null, mode, total: 0 });
    spaceId = resolved.space.id;
  }
  let authorId: number | undefined;
  if (sp.get("author")) {
    const resolved = await resolveUser(sp.get("author") ?? "");
    if (!resolved) return Response.json({ items: [], nextCursor: null, mode, total: 0 });
    authorId = resolved.user.id;
  }
  const savedBy = sp.get("saved") === "1" && viewer ? viewer.id : undefined;
  if (sp.get("saved") === "1" && !viewer) return Response.json({ items: [], nextCursor: null, mode, total: 0 });

  const followingUserId = sp.get("following") === "1" && viewer ? viewer.id : undefined;
  if (sp.get("following") === "1" && !viewer) return Response.json({ items: [], nextCursor: null, mode, total: 0 });

  const page = await listPosts({
    mode,
    spaceId,
    authorId,
    savedBy,
    followingUserId,
    solvedOnly: sp.get("solved") === "1",
    cursor,
    viewer,
  });
  return Response.json(page);
});

interface CreatePostBody extends Record<string, unknown> {
  spaceSlug?: string;
  title?: string;
  body?: string;
  kind?: string;
}

export const POST = handler(async (req: NextRequest) => {
  const actor = await requireActor();
  const body = await readJson<CreatePostBody>(req);
  const resolved = await resolveSpace(str(body.spaceSlug, "space"));
  if (!resolved) throw new HttpError(404, "Space not found", "not_found");
  const space = resolved.space;

  if (space.privacy !== "public") {
    const [m] = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.userId, actor.id), eq(memberships.spaceId, space.id)))
      .limit(1);
    if (!m && actor.role === "member") throw new HttpError(403, "Only members can post in this space", "forbidden");
  }

  const title = str(body.title, "title", { min: 8, max: 180 });
  const content = str(body.body, "body", { min: 1, max: 20_000 });
  const kind = oneOf(body.kind ?? "discussion", postKindEnum.enumValues, "kind");

  await assertRateLimit(actor.id, "post");
  const verdict = screenContent(`${title}\n${content}`);

  const created = await db.transaction(async (tx) => {
    const [post] = await tx
      .insert(posts)
      .values({ spaceId: space.id, authorId: actor.id, title, body: content, kind, slug: slugify(title) })
      .returning();
    await fileAutoReport(tx, "post", post.id, space.id, verdict);
    return post;
  });
  const [spaceRow] = await db.select({ slug: spaces.slug }).from(spaces).where(eq(spaces.id, space.id)).limit(1);
  const newBadges = await evaluateBadges(actor.id);

  return Response.json(
    { id: created.id, href: routes.post(spaceRow.slug, created.id, created.slug), newBadges: newBadges.map((b) => b.name), flagged: verdict.needsReview },
    { status: 201 },
  );
});
