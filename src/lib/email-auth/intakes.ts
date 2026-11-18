import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { leadIntakes, leads } from "@/db/schema";
import type { ResolvedSession } from "../auth";
import { HttpError } from "../errors";
import { submissionColumns, submitPendingLead } from "../lead-submissions";
import { routes } from "../utils";
import { recipientHash } from "./flow";
import { UUID, type EmailAuthConfig } from "./policy";

type VerifiedSession = Extract<ResolvedSession, { kind: "email" }>;

function matchingIntake(config: EmailAuthConfig, session: ResolvedSession | null, id: unknown) {
  if (session?.kind !== "email" || typeof id !== "string" || !UUID.test(id) || session.intakeId !== id.toLowerCase()) return undefined;
  return and(eq(leadIntakes.id, id), eq(leadIntakes.emailHash, recipientHash(config, session.email)));
}

const notFound = () => new HttpError(404, "Draft not found for this sign-in", "not_found");
const expired = () => new HttpError(410, "This draft is no longer available. Start a new draft.", "intake_expired");

export async function loadIntakeConfirmation(config: EmailAuthConfig, session: ResolvedSession | null, id: unknown) {
  const match = matchingIntake(config, session, id);
  if (!match || !session) return null;
  const [row] = await db.select({ intake: leadIntakes, leadAuthor: leads.authorId }).from(leadIntakes).leftJoin(leads, eq(leads.id, leadIntakes.leadId)).where(match).limit(1);
  if (!row) return null;
  const { intake } = row;
  if (intake.consumedAt && intake.leadId) {
    return row.leadAuthor === session.user.id ? { kind: "submitted" as const, href: routes.leadSubmission(intake.leadId) } : null;
  }
  if (intake.consumedAt || !intake.brief || intake.expiresAt <= new Date()) return { kind: "expired" as const };
  return { kind: "pending" as const, id: intake.id, brief: intake.brief, submissionKey: intake.submissionKey, expiresAt: intake.expiresAt };
}

export async function confirmIntake(config: EmailAuthConfig, session: VerifiedSession, id: unknown) {
  const match = matchingIntake(config, session, id);
  if (!match) throw notFound();
  return db.transaction(async (tx) => {
    const [intake] = await tx.select().from(leadIntakes).where(match).limit(1).for("update");
    if (!intake) throw notFound();
    if (intake.consumedAt) {
      if (!intake.leadId) throw expired();
      const [lead] = await tx.select(submissionColumns).from(leads).where(and(eq(leads.id, intake.leadId), eq(leads.authorId, session.user.id))).limit(1);
      if (!lead) throw notFound();
      return { lead, status: 200 };
    }
    const now = new Date();
    if (intake.expiresAt <= now || !intake.brief) throw expired();
    const result = await submitPendingLead(tx, session.user.id, intake.submissionKey, intake.brief);
    await tx.update(leadIntakes).set({ leadId: result.lead.id, consumedAt: now, brief: null, displayName: null, companyName: null }).where(eq(leadIntakes.id, intake.id));
    return result;
  });
}
