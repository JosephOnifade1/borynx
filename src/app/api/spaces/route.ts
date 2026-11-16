import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, privacyEnum, spaceAliases, spaces, type Space } from "@/db/schema";
import { handler, oneOf, readJson, str } from "@/lib/api";
import { getCurrentUser, HttpError, requireActor } from "@/lib/auth";
import { evaluateBadges } from "@/lib/services";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const all = await db.select().from(spaces).orderBy(desc(spaces.memberCount));
  return Response.json({ items: all });
});

interface CreateSpaceBody extends Record<string, unknown> {
  slug?: string;
  name?: string;
  tagline?: string;
  description?: string;
  topics?: string[];
  rules?: string[];
  accentHue?: number;
  privacy?: string;
}

export const POST = handler(async (req: NextRequest) => {
  const actor = await requireActor();
  const body = await readJson<CreateSpaceBody>(req);

  const rawSlug = str(body.slug, "slug", { min: 2, max: 48 });
  const slug = slugify(rawSlug, 48);
  if (!slug || slug.length < 2) {
    throw new HttpError(400, "Slug must be at least 2 characters", "bad_request");
  }

  const name = str(body.name, "name", { min: 3, max: 80 });
  const tagline = typeof body.tagline === "string" ? body.tagline.trim().slice(0, 140) : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 4000) : "";
  const privacy = (body.privacy ? oneOf(body.privacy, privacyEnum.enumValues, "privacy") : "public") as Space["privacy"];
  const accentHue = typeof body.accentHue === "number" ? Math.max(0, Math.min(360, Math.round(body.accentHue))) : 20;

  const topics = Array.isArray(body.topics)
    ? body.topics.filter((t) => typeof t === "string" && t.trim().length > 0).map((t) => t.trim().slice(0, 32)).slice(0, 10)
    : [];

  const rules = Array.isArray(body.rules)
    ? body.rules.filter((r) => typeof r === "string" && r.trim().length > 0).map((r) => r.trim().slice(0, 200)).slice(0, 10)
    : [];

  // Check uniqueness
  const [existingDirect] = await db.select({ id: spaces.id }).from(spaces).where(eq(spaces.slug, slug)).limit(1);
  if (existingDirect) {
    throw new HttpError(409, `The space slug "b/${slug}" is already taken`, "conflict");
  }
  const [existingAlias] = await db.select({ spaceId: spaceAliases.spaceId }).from(spaceAliases).where(eq(spaceAliases.alias, slug)).limit(1);
  if (existingAlias) {
    throw new HttpError(409, `The space slug "b/${slug}" is reserved as an alias`, "conflict");
  }

  const created = await db.transaction(async (tx) => {
    const [sp] = await tx
      .insert(spaces)
      .values({
        slug,
        name,
        tagline,
        description,
        privacy,
        topics,
        rules,
        accentHue,
        memberCount: 1,
        createdById: actor.id,
      })
      .returning();

    await tx.insert(memberships).values({
      userId: actor.id,
      spaceId: sp.id,
      modRole: "owner",
    });

    return sp;
  });

  await evaluateBadges(actor.id);

  return Response.json({ ok: true, space: created }, { status: 201 });
});
