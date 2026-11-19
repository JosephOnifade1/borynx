import { assertSameOrigin, handler, privateJson, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { parseReviewDecision, parseReviewId } from "@/lib/lead-review-input";
import { moderateLeadReview } from "@/lib/lead-reviews";

export const dynamic = "force-dynamic";

export const PATCH = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const actor = await requireStaff();
  const id = parseReviewId(params.id);
  const decision = parseReviewDecision(await readJson(req));
  return privateJson(await moderateLeadReview(id, actor.id, decision));
});
