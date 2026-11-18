import { NextRequest } from "next/server";
import { db } from "@/db";
import { handler, readJson } from "@/lib/api";
import { getCurrentUser, requireActor } from "@/lib/auth";
import { listLeads, resolveUser } from "@/lib/queries";
import { isRankMode } from "@/lib/sorting";
import { leadBody, parseSubmissionKey } from "@/lib/lead-input";
import { submissionResponse, submitPendingLead } from "@/lib/lead-submissions";

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

export const POST = handler(async (req: NextRequest) => {
  // Only managed email sessions (or explicitly enabled demo actors) resolve here.
  const actor = await requireActor();
  const body = leadBody(await readJson(req));
  const submissionKey = parseSubmissionKey(body.submissionKey);
  const result = await db.transaction((tx) => submitPendingLead(tx, actor.id, submissionKey, body));
  return submissionResponse(result.lead, result.status);
});
