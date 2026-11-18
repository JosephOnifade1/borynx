import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailAuthSends, leadIntakes } from "@/db/schema";
import { HttpError } from "../errors";
import { leadWriteValues, screenLead } from "../lead-submissions";
import { ingressHash, recipientHash, signEmailFlow, type EmailFlow } from "./flow";
import type { parseLeadIntake } from "./input";
import { emailCookie, EMAIL_FLOW_COOKIE, EMAIL_LINK_TTL, trustedClientIp, type EmailAuthConfig } from "./policy";
import { sendSupabaseLink } from "./supabase";

const INTAKE_TTL_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const SEND_LOCK = 4_242_005;

type Intake = Omit<ReturnType<typeof parseLeadIntake>, "email">;

function enforceLimit(times: Date[], max: number, windowMs: number, now: number) {
  const oldest = times[max - 1]; // queries return newest first, at most max rows
  if (!oldest || oldest.getTime() + windowMs <= now) return;
  const retryAfter = Math.ceil((oldest.getTime() + windowMs - now) / 1000);
  throw new HttpError(429, "Too many email requests. Wait before trying again.", "email_rate_limited", undefined, retryAfter);
}

async function reserveSend(emailHash: string, ipHash: string, intake?: Intake) {
  return db.transaction(async (tx) => {
    // Small staging budget: make every reservation atomic across both sending endpoints and
    // every replica. Release the lock before calling the provider; failures also spend a slot.
    await tx.execute(sql`select pg_advisory_xact_lock(${SEND_LOCK}::integer, 0::integer)`);
    const now = new Date();
    const since = new Date(now.getTime() - HOUR_MS);
    let intakeId: string | null = null;
    if (intake) {
      const [existing] = await tx.select({ id: leadIntakes.id, expiresAt: leadIntakes.expiresAt, consumedAt: leadIntakes.consumedAt }).from(leadIntakes)
        .where(and(eq(leadIntakes.emailHash, emailHash), eq(leadIntakes.submissionKey, intake.submissionKey))).limit(1).for("share");
      if (existing?.consumedAt) return null; // a consumed draft can never trigger another email
      if (existing && existing.expiresAt <= now) throw new HttpError(410, "This draft expired. Start a new draft to request another link.", "intake_expired");
      if (existing) {
        intakeId = existing.id; // retries never replace the saved brief or extend its expiry
      } else {
        const latest = await tx.select({ at: leadIntakes.createdAt }).from(leadIntakes).where(and(eq(leadIntakes.ipHash, ipHash), gt(leadIntakes.createdAt, since)))
          .orderBy(desc(leadIntakes.createdAt)).limit(2);
        enforceLimit(latest.map((row) => row.at), 2, HOUR_MS, now.getTime());
        screenLead(intake.brief);
        await leadWriteValues(tx, intake.brief); // reject nonpublic or stale space choices before sending
      }
    }
    const byEmail = await tx.select({ at: emailAuthSends.attemptedAt }).from(emailAuthSends)
      .where(and(eq(emailAuthSends.emailHash, emailHash), gt(emailAuthSends.attemptedAt, since))).orderBy(desc(emailAuthSends.attemptedAt)).limit(3);
    enforceLimit(byEmail.map((row) => row.at), 1, COOLDOWN_MS, now.getTime());
    enforceLimit(byEmail.map((row) => row.at), 3, HOUR_MS, now.getTime());
    const byIp = await tx.select({ at: emailAuthSends.attemptedAt }).from(emailAuthSends)
      .where(and(eq(emailAuthSends.ipHash, ipHash), gt(emailAuthSends.attemptedAt, since))).orderBy(desc(emailAuthSends.attemptedAt)).limit(6);
    enforceLimit(byIp.map((row) => row.at), 6, HOUR_MS, now.getTime());
    const global = await tx.select({ at: emailAuthSends.attemptedAt }).from(emailAuthSends)
      .where(gt(emailAuthSends.attemptedAt, since)).orderBy(desc(emailAuthSends.attemptedAt)).limit(30);
    enforceLimit(global.map((row) => row.at), 30, HOUR_MS, now.getTime());

    if (intake && !intakeId) {
      const [created] = await tx.insert(leadIntakes).values({
        ...intake, emailHash, ipHash, createdAt: now, expiresAt: new Date(now.getTime() + INTAKE_TTL_MS),
      }).returning({ id: leadIntakes.id });
      intakeId = created.id;
    }
    await tx.insert(emailAuthSends).values({ emailHash, ipHash, attemptedAt: now });
    return { intakeId };
  });
}

export async function requestEmailLink(config: EmailAuthConfig, req: Request, email: string, next: string, intake?: Intake): Promise<Response> {
  const emailHash = recipientHash(config, email);
  const reservation = await reserveSend(emailHash, ingressHash(config, trustedClientIp(req.headers)), intake);
  const response = Response.json({ status: "check_email" }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
  if (!reservation) return response;

  const flow: EmailFlow = { emailHash, intakeId: reservation.intakeId, next, verifier: randomBytes(32).toString("base64url"), expiresAt: Date.now() + EMAIL_LINK_TTL * 1000 };
  const outcome = await sendSupabaseLink(config, email, flow.verifier);
  if (outcome === "unavailable") {
    console.warn("[borynx] Email provider unavailable");
    throw new HttpError(503, "Could not request a sign-in email.", "email_unavailable", undefined, 60);
  }
  // The same 202 response shape on provider denials also avoids cookie-based enumeration.
  response.headers.append("Set-Cookie", emailCookie(EMAIL_FLOW_COOKIE, signEmailFlow(config, flow), EMAIL_LINK_TTL));
  return response;
}
