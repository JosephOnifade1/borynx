import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { spaces, type Lead } from "@/db/schema";
import { HttpError } from "./errors";
import type { LeadFields } from "./lead-input";
import { routes, slugify } from "./utils";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function leadWriteValues(tx: Tx, { spaceSlug, deadlineAt, ...fields }: LeadFields) {
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

export function submissionResponse(lead: Pick<Lead, "id" | "revision" | "publicationStatus">, status = 200) {
  return Response.json({ id: lead.id, href: routes.leadSubmission(lead.id), revision: lead.revision, publicationStatus: lead.publicationStatus }, {
    status, headers: { "Cache-Control": "private, no-store" },
  });
}
