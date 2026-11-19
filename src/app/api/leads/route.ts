import { NextRequest } from "next/server";
import { db } from "@/db";
import { handler, privateJson, readJson } from "@/lib/api";
import { getCurrentUser, requireActor } from "@/lib/auth";
import { resolveUser } from "@/lib/queries";
import { listLeads } from "@/lib/lead-feed";
import { parseLeadAuthor, parseLeadFilters, parseLeadPaging } from "@/lib/lead-discovery";
import { leadBody, parseSubmissionKey } from "@/lib/lead-input";
import { submissionResponse, submitPendingLead } from "@/lib/lead-submissions";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const filters = parseLeadFilters(params);
  const paging = parseLeadPaging(params, filters.sort);
  const author = parseLeadAuthor(params);
  const [viewer, resolved] = await Promise.all([getCurrentUser(), author ? resolveUser(author) : null]);
  if (author && !resolved) return privateJson({ items: [], nextCursor: null, mode: filters.sort, total: 0 });
  return privateJson(await listLeads({ filters, paging, authorId: resolved?.user.id, viewerId: viewer?.id ?? null }));
});

export const POST = handler(async (req: NextRequest) => {
  // Only managed email sessions (or explicitly enabled demo actors) resolve here.
  const actor = await requireActor();
  const body = leadBody(await readJson(req));
  const submissionKey = parseSubmissionKey(body.submissionKey);
  const result = await db.transaction((tx) => submitPendingLead(tx, actor.id, submissionKey, body), { isolationLevel: "read committed" });
  return submissionResponse(result.lead, result.status);
});
