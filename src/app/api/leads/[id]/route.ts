import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { handler, readJson } from "@/lib/api";
import { HttpError, requireActor } from "@/lib/auth";
import { lockLead, parseLeadId } from "@/lib/lead-access";
import { leadBody, parseLeadFields, parseLeadRevision } from "@/lib/lead-input";
import { leadWriteValues, submissionResponse } from "@/lib/lead-submissions";
import { fileAutoReport, screenContent } from "@/lib/services";

export const dynamic = "force-dynamic";

export const PATCH = handler(async (req, { params }) => {
  const actor = await requireActor();
  const id = parseLeadId(params.id);
  const body = leadBody(await readJson(req));
  const revision = parseLeadRevision(body.revision);

  return db.transaction(async (tx) => {
    const lead = await lockLead(tx, id, and(eq(leads.authorId, actor.id), eq(leads.isRemoved, false)));
    if (lead.publicationStatus !== "changes_requested" || lead.revision !== revision || lead.status === "closed") {
      throw new HttpError(409, "This submission has changed or is not open for corrections. Reload and try again.", "lead_conflict");
    }
    const fields = parseLeadFields(body, { enforceFloor: lead.submissionKey !== null });
    const verdict = screenContent(`${fields.title}\n${fields.description}\n${fields.location}`);
    const values = await leadWriteValues(tx, fields);
    const [updated] = await tx.update(leads).set({ ...values, publicationStatus: "pending_review", revision: revision + 1 })
      .where(eq(leads.id, id)).returning();
    await fileAutoReport(tx, "lead", id, updated.spaceId, verdict);
    return submissionResponse(updated);
  });
});
