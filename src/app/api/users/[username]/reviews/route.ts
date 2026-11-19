import { handler, privateJson } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { parseReviewCursor } from "@/lib/lead-review-input";
import { listPublicLeadReviews } from "@/lib/lead-reviews";
import { resolveUser } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const GET = handler(async (req, { params }) => {
  const cursors = req.nextUrl.searchParams.getAll("cursor");
  const cursor = parseReviewCursor(cursors.length > 1 ? cursors : cursors[0]);
  const resolved = await resolveUser(params.username);
  if (!resolved) throw new HttpError(404, "User not found", "not_found");
  return privateJson(await listPublicLeadReviews(resolved.user.id, cursor));
});
