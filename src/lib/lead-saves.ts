import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { leads, leadSaves } from "@/db/schema";
import { HttpError } from "./errors";
import { publicLead } from "./lead-access";

const saveKey = (userId: number, leadId: number) => and(eq(leadSaves.userId, userId), eq(leadSaves.leadId, leadId));

export async function isLeadSaved(userId: number, leadId: number): Promise<boolean> {
  const [row] = await db.select({ leadId: leadSaves.leadId }).from(leadSaves).where(saveKey(userId, leadId)).limit(1);
  return Boolean(row);
}

export async function saveLead(userId: number, leadId: number) {
  await db.transaction(async (tx) => {
    // Only public leads are saveable, even for their owner or staff. Share locks can coexist,
    // but serialize with lead removal and publication changes during the insert.
    const [lead] = await tx.select({ id: leads.id }).from(leads).where(and(publicLead, eq(leads.id, leadId))).limit(1).for("share");
    if (!lead) throw new HttpError(404, "Lead not found", "not_found");
    await tx.insert(leadSaves).values({ userId, leadId }).onConflictDoNothing({ target: [leadSaves.userId, leadSaves.leadId] });
  });
}

export async function unsaveLead(userId: number, leadId: number) {
  // Do not look up the lead itself: a private, vanished, or never-saved ID gives the same result.
  await db.delete(leadSaves).where(saveKey(userId, leadId));
}
