import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads, spaces, type Lead } from "@/db/schema";
import { HttpError } from "./errors";
import { parseLeadFields, type LeadFields } from "./lead-input";
import { assertRateLimit, fileAutoReport, screenContent } from "./services";
import { routes, slugify } from "./utils";

export type LeadTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function leadWriteValues(tx: LeadTransaction, { spaceSlug, deadlineAt, ...fields }: LeadFields) {
  let spaceId: number | null = null;
  if (spaceSlug) {
    const [space] = await tx.select({ id: spaces.id }).from(spaces)
      .where(and(eq(spaces.slug, spaceSlug), eq(spaces.privacy, "public"))).limit(1).for("share");
    if (!space) throw new HttpError(422, "Choose a public space or leave it unlinked.", "invalid_lead", {
      spaceSlug: "Choose a public space or leave it unlinked.",
    });
    spaceId = space.id;
  }
  return { ...fields, spaceId, deadlineAt: deadlineAt ? new Date(deadlineAt) : null, slug: slugify(fields.title) };
}

export const submissionColumns = { id: leads.id, revision: leads.revision, publicationStatus: leads.publicationStatus };
const LEAD_SUBMISSION_LOCK = 4_242_003;

export function screenLead(fields: LeadFields) {
  return screenContent(`${fields.title}\n${fields.description}\n${fields.location}`);
}

/** One writer for both direct and verified-intake submissions, including the same author's rate limit. */
export async function submitPendingLead(tx: LeadTransaction, authorId: number, submissionKey: string, input: unknown) {
  await tx.execute(sql`select pg_advisory_xact_lock(${LEAD_SUBMISSION_LOCK}::integer, ${authorId}::integer)`);
  const [existing] = await tx.select(submissionColumns).from(leads)
    .where(and(eq(leads.authorId, authorId), eq(leads.submissionKey, submissionKey))).limit(1);
  if (existing) return { lead: existing, status: 200 };
  const fields = parseLeadFields(input);
  await assertRateLimit(authorId, "lead", tx);
  const verdict = screenLead(fields);
  const values = await leadWriteValues(tx, fields);
  const [created] = await tx.insert(leads).values({ ...values, authorId, submissionKey, publicationStatus: "pending_review" })
    .returning({ ...submissionColumns, spaceId: leads.spaceId });
  await fileAutoReport(tx, "lead", created.id, created.spaceId, verdict);
  return { lead: created, status: 201 };
}

export function submissionResponse(lead: Pick<Lead, "id" | "revision" | "publicationStatus">, status = 200) {
  return Response.json({ id: lead.id, href: routes.leadSubmission(lead.id), revision: lead.revision, publicationStatus: lead.publicationStatus }, {
    status, headers: { "Cache-Control": "private, no-store" },
  });
}
