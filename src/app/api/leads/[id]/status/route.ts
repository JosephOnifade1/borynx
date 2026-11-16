import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads, leadStatusEnum, type Lead } from "@/db/schema";
import { handler, num, oneOf, readJson } from "@/lib/api";
import { HttpError, requireActor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const PATCH = handler(async (req: NextRequest, { params }) => {
  const actor = await requireActor();
  const leadId = num(params.id, "leadId");
  const body = await readJson<{ status?: string }>(req);
  const nextStatus = oneOf(body.status, leadStatusEnum.enumValues, "status") as Lead["status"];

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead || lead.isRemoved) throw new HttpError(404, "Lead not found", "not_found");

  const isOwner = lead.authorId === actor.id;
  const isStaff = actor.role === "admin" || actor.role === "moderator";
  if (!isOwner && !isStaff) {
    throw new HttpError(403, "Only the lead creator or staff can change status", "forbidden");
  }

  await db.update(leads).set({ status: nextStatus }).where(eq(leads.id, leadId));

  return Response.json({ ok: true, status: nextStatus });
});
