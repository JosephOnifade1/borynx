import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { leads, spaces, type Lead } from "@/db/schema";
import { handler, readJson } from "@/lib/api";
import { HttpError, isSiteStaff, requireActor } from "@/lib/auth";
import { lockLead, parseLeadId } from "@/lib/lead-access";
import { leadBody, parseLeadRevision } from "@/lib/lead-input";
import { submissionResponse } from "@/lib/lead-submissions";
import { createNotification } from "@/lib/notifications";
import { evaluateBadges } from "@/lib/services";
import { routes } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DECISIONS = {
  publish: { state: "published", message: "Your lead was published" },
  request_changes: { state: "changes_requested", message: "A reviewer requested changes to your lead" },
  reject: { state: "rejected", message: "Your lead was not approved" },
} as const satisfies Record<string, { state: Lead["publicationStatus"]; message: string }>;

export const PATCH = handler(async (req, { params }) => {
  const actor = await requireActor();
  if (!isSiteStaff(actor)) throw new HttpError(403, "Site reviewer access required", "forbidden");
  const id = parseLeadId(params.id);
  const body = leadBody(await readJson(req));
  const revision = parseLeadRevision(body.revision);
  if (typeof body.action !== "string" || !Object.hasOwn(DECISIONS, body.action)) {
    throw new HttpError(422, "Choose a review action", "invalid_action");
  }
  const action = body.action as keyof typeof DECISIONS;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if ((action !== "publish" && !reason) || (body.reason != null && typeof body.reason !== "string") || reason.length > 1000 || reason.includes("\0")) {
    throw new HttpError(422, "A reason of 1–1,000 characters is required for changes or rejection.", "invalid_reason");
  }

  return db.transaction(async (tx) => {
    const lead = await lockLead(tx, id);
    if (lead.authorId === actor.id) throw new HttpError(403, "You can't review your own lead", "forbidden");
    if (lead.isRemoved || lead.status === "closed" || lead.publicationStatus !== "pending_review" || lead.revision !== revision) {
      throw new HttpError(409, "This revision is no longer pending review. Reload before deciding.", "lead_conflict");
    }
    if (action === "publish" && lead.spaceId !== null) {
      const [space] = await tx.select({ id: spaces.id }).from(spaces)
        .where(and(eq(spaces.id, lead.spaceId), eq(spaces.privacy, "public"))).limit(1).for("share");
      if (!space) throw new HttpError(409, "The linked space is not public. Request changes before publishing.", "lead_conflict");
    }
    const now = new Date();
    const decision = DECISIONS[action];
    const [updated] = await tx.update(leads).set({
      publicationStatus: decision.state,
      publishedAt: action === "publish" ? now : null,
      reviewedAt: now,
      reviewedById: actor.id,
      reviewNote: reason || null,
    }).where(and(eq(leads.id, id), eq(leads.revision, revision), eq(leads.publicationStatus, "pending_review"), eq(leads.isRemoved, false), ne(leads.status, "closed"))).returning();
    if (!updated) throw new HttpError(409, "This revision is no longer pending review.", "lead_conflict");
    await createNotification({
      userId: lead.authorId, actorId: actor.id, type: "lead_review_decision", entityType: "lead", entityId: id,
      message: `${decision.message}: “${lead.title}”${reason ? ` — ${reason}` : ""}`,
      href: routes.leadSubmission(id),
    }, tx);
    if (action === "publish") await evaluateBadges(lead.authorId, tx);
    return submissionResponse(updated);
  });
});
