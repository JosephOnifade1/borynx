import { assertSameOrigin, handler, privateJson, readJson } from "@/lib/api";
import { requireActor } from "@/lib/auth";
import { parseLeadId } from "@/lib/lead-access";
import { parseReviewInput } from "@/lib/lead-review-input";
import { createLeadReview } from "@/lib/lead-reviews";

export const dynamic = "force-dynamic";

export const POST = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const buyer = await requireActor();
  const id = parseLeadId(params.id);
  const input = parseReviewInput(await readJson(req));
  return privateJson(await createLeadReview(id, buyer.id, input), 201);
});
