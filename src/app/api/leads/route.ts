import { NextRequest } from "next/server";
import { db } from "@/db";
import { leadKindEnum, leads } from "@/db/schema";
import { handler, oneOf, readJson, str } from "@/lib/api";
import { getCurrentUser, requireActor } from "@/lib/auth";
import { listLeads, resolveSpace, resolveUser } from "@/lib/queries";
import { assertRateLimit, evaluateBadges, fileAutoReport, screenContent } from "@/lib/services";
import { isRankMode } from "@/lib/sorting";
import { routes, slugify } from "@/lib/utils";
import { LEAD_CATEGORIES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const viewer = await getCurrentUser();
  const modeParam = sp.get("sort");
  let authorId: number | undefined;
  if (sp.get("author")) {
    const resolved = await resolveUser(sp.get("author") ?? "");
    if (!resolved) return Response.json({ items: [], nextCursor: null, mode: "new", total: 0 });
    authorId = resolved.user.id;
  }
  const page = await listLeads({
    authorId,
    mode: isRankMode(modeParam) ? modeParam : "new",
    category: sp.get("category") ?? undefined,
    kind: sp.get("kind") ?? undefined,
    verifiedOnly: sp.get("verified") === "1",
    cursor: Number.parseInt(sp.get("cursor") ?? "0", 10) || 0,
    viewerId: viewer?.id ?? null,
  });
  return Response.json(page);
});

interface CreateLeadBody extends Record<string, unknown> {
  title?: string;
  description?: string;
  category?: string;
  kind?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  location?: string;
  spaceSlug?: string;
}

export const POST = handler(async (req: NextRequest) => {
  const actor = await requireActor();
  const body = await readJson<CreateLeadBody>(req);
  const title = str(body.title, "title", { min: 10, max: 180 });
  const description = str(body.description, "description", { min: 40, max: 20_000 });
  const category = oneOf(body.category, LEAD_CATEGORIES, "category");
  const kind = oneOf(body.kind ?? "contract", leadKindEnum.enumValues, "kind");
  const budgetMin = Math.max(0, Math.round(Number(body.budgetMin) || 0));
  const budgetMax = Math.max(budgetMin, Math.round(Number(body.budgetMax) || 0));
  const currency = oneOf((body.currency ?? "USD").toString().toUpperCase(), ["USD", "EUR", "GBP"], "currency");
  const location = typeof body.location === "string" && body.location.trim() ? body.location.trim().slice(0, 80) : "Remote";
  const space = body.spaceSlug ? await resolveSpace(String(body.spaceSlug)) : null;

  await assertRateLimit(actor.id, "lead");
  const verdict = screenContent(`${title}\n${description}`);

  const created = await db.transaction(async (tx) => {
    const [lead] = await tx
      .insert(leads)
      .values({
        authorId: actor.id,
        spaceId: space?.space.id ?? null,
        slug: slugify(title),
        title,
        description,
        category,
        kind,
        budgetMin,
        budgetMax,
        currency,
        location,
        // Verified Pros get their leads auto-verified; others queue for vetting.
        isVerified: actor.isVerified,
      })
      .returning();
    await fileAutoReport(tx, "lead", lead.id, space?.space.id ?? null, verdict);
    return lead;
  });
  const newBadges = await evaluateBadges(actor.id);
  return Response.json({ id: created.id, href: routes.lead(created.id, created.slug), newBadges: newBadges.map((b) => b.name), flagged: verdict.needsReview }, { status: 201 });
});
