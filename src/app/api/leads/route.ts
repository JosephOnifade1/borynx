import { eq, and, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { handler, readJson } from "@/lib/api";
import { getCurrentUser, requireActor } from "@/lib/auth";
import { listLeads, resolveUser } from "@/lib/queries";
import { assertRateLimit, fileAutoReport, screenContent } from "@/lib/services";
import { isRankMode } from "@/lib/sorting";
import { leadBody, parseLeadFields, parseSubmissionKey } from "@/lib/lead-input";
import { leadWriteValues, submissionResponse } from "@/lib/lead-submissions";

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
    openOnly: sp.get("active") === "1",
    mode: isRankMode(modeParam) ? modeParam : "new",
    category: sp.get("category") ?? undefined,
    kind: sp.get("kind") ?? undefined,
    verifiedOnly: sp.get("verified") === "1",
    cursor: Number.parseInt(sp.get("cursor") ?? "0", 10) || 0,
    viewerId: viewer?.id ?? null,
  });
  return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
});

// Serialize submissions per author so retry and rate-limit checks see committed rows.
const LEAD_SUBMISSION_LOCK = 4_242_003;

export const POST = handler(async (req: NextRequest) => {
  const actor = await requireActor();
  const body = leadBody(await readJson(req));
  const submissionKey = parseSubmissionKey(body.submissionKey);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LEAD_SUBMISSION_LOCK}::integer, ${actor.id}::integer)`);
    const [existing] = await tx.select({ id: leads.id, revision: leads.revision, publicationStatus: leads.publicationStatus })
      .from(leads).where(and(eq(leads.authorId, actor.id), eq(leads.submissionKey, submissionKey))).limit(1);
    if (existing) return submissionResponse(existing);

    const fields = parseLeadFields(body);
    await assertRateLimit(actor.id, "lead", tx);
    const verdict = screenContent(`${fields.title}\n${fields.description}\n${fields.location}`);
    const values = await leadWriteValues(tx, fields);
    const [created] = await tx.insert(leads).values({ ...values, authorId: actor.id, submissionKey, publicationStatus: "pending_review" }).returning();
    await fileAutoReport(tx, "lead", created.id, created.spaceId, verdict);
    return submissionResponse(created, 201);
  });
});
