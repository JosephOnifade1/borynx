import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { authIdentities, leadIntakes, sessions, users } from "@/db/schema";
import { hashToken, isSuspended } from "../auth";
import type { EmailFlow } from "./flow";
import { EMAIL_SESSION_TTL, OPAQUE_TOKEN, type EmailAuthConfig } from "./policy";
import type { VerifiedEmail } from "./supabase";

const IDENTITY_LOCK = 4_242_006;

export async function createEmailSession(config: EmailAuthConfig, proof: VerifiedEmail, flow: EmailFlow, previousToken?: string) {
  return db.transaction(async (tx) => {
    const intakeId = flow.intakeId;
    const [intake] = intakeId ? await tx.select({ displayName: leadIntakes.displayName, companyName: leadIntakes.companyName, expiresAt: leadIntakes.expiresAt })
      .from(leadIntakes).where(and(eq(leadIntakes.id, intakeId), eq(leadIntakes.emailHash, flow.emailHash))).limit(1).for("share") : [];
    if (intakeId && !intake) return null;
    await tx.execute(sql`select pg_advisory_xact_lock(${IDENTITY_LOCK}::integer, hashtext(${`${config.provider}:${proof.subject}`}))`);
    const [existing] = await tx.select({ identity: authIdentities, user: users }).from(authIdentities).innerJoin(users, eq(users.id, authIdentities.userId))
      .where(and(eq(authIdentities.provider, config.provider), eq(authIdentities.subject, proof.subject))).limit(1);
    let user = existing?.user;
    let identity = existing?.identity;
    const now = new Date();
    if (user && isSuspended(user, now)) return null;
    if (!user) {
      const active = intake && intake.expiresAt > now ? intake : null;
      // Create a regular member; no handle, email, metadata, or historical account is auto-linked.
      for (let n = 0; n < 3 && !user; n++) {
        [user] = await tx.insert(users).values({
          username: `member-${randomBytes(12).toString("hex")}`,
          displayName: active?.displayName ?? "Borynx member",
          companyName: active?.companyName ?? null,
        }).onConflictDoNothing({ target: users.username }).returning();
      }
      if (!user) throw new Error("Unable to allocate a handle");
      [identity] = await tx.insert(authIdentities).values({ provider: config.provider, ...proof, userId: user.id }).returning();
    } else if (identity.email !== proof.email) {
      // A provider-verified change keeps the same user, but invalidates old Borynx sessions.
      await tx.update(authIdentities).set({ email: proof.email, verifiedAt: proof.verifiedAt }).where(eq(authIdentities.id, identity.id));
      await tx.delete(sessions).where(eq(sessions.authIdentityId, identity.id));
    }
    if (previousToken && OPAQUE_TOKEN.test(previousToken)) {
      await tx.delete(sessions).where(and(eq(sessions.id, hashToken(previousToken)), isNotNull(sessions.authIdentityId)));
    }
    await tx.delete(sessions).where(lt(sessions.expiresAt, now));
    const token = randomBytes(32).toString("base64url");
    await tx.insert(sessions).values({ id: hashToken(token), userId: user.id, authIdentityId: identity.id, intakeId, expiresAt: new Date(now.getTime() + EMAIL_SESSION_TTL * 1000) });
    return { token, next: intakeId ? `/l/new?intake=${intakeId}` : flow.next };
  });
}
