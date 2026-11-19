import { and, desc, eq, exists, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { leadBids, leadKickoffs, leads, notifications, users, type Notification, type NotificationType } from "@/db/schema";
import { activeLeadAward, matchingLeadAward, matchingLeadKickoff, publicLead } from "./lead-access";
import type { AuthorSummary } from "./types";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = typeof db | Tx;

export interface NotificationWithActor extends Notification {
  actor: AuthorSummary | null;
}

export async function createNotification(
  params: {
    userId: number;
    actorId?: number | null;
    type: NotificationType;
    entityType?: string;
    entityId?: number;
    message: string;
    href: string;
  },
  exec: Executor = db,
): Promise<Notification | null> {
  // Never notify a user of their own actions
  if (params.actorId && params.userId === params.actorId) {
    return null;
  }

  const [row] = await exec
    .insert(notifications)
    .values({
      userId: params.userId,
      actorId: params.actorId ?? null,
      type: params.type,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      message: params.message,
      href: params.href,
      isRead: false,
    })
    .returning();

  return row ?? null;
}

// Legacy bid notices may reference a lead that the publication migration kept private.
function visibleNotification(userId: number) {
  const visibleLead = exists(db.select({ id: leads.id }).from(leads).where(and(
    eq(leads.id, notifications.entityId),
    or(publicLead, and(eq(leads.isRemoved, false), eq(leads.authorId, userId))),
  )));
  // A repaired award or a cascaded kickoff deletion can leave a generic notice behind.
  // Never show it for a different award, or count it as unread once kickoff is unavailable.
  const visibleKickoff = exists(db.select({ id: leads.id }).from(leads)
    .innerJoin(leadBids, matchingLeadAward).innerJoin(leadKickoffs, matchingLeadKickoff)
    .where(and(eq(notifications.entityType, "lead"), eq(leads.id, notifications.entityId), activeLeadAward, or(
      and(eq(leadKickoffs.winnerId, userId), eq(leadKickoffs.buyerId, notifications.actorId)),
      and(eq(leadKickoffs.buyerId, userId), eq(leadKickoffs.winnerId, notifications.actorId)),
    ))));
  return and(eq(notifications.userId, userId), or(
    and(eq(notifications.type, "lead_kickoff"), visibleKickoff),
    and(ne(notifications.type, "lead_kickoff"), or(isNull(notifications.entityType), ne(notifications.entityType, "lead"), visibleLead)),
  ));
}

export async function getUnreadNotificationCount(userId: number, exec: Executor = db): Promise<number> {
  const [row] = await exec
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(visibleNotification(userId), eq(notifications.isRead, false)));
  return row?.count ?? 0;
}

export async function listNotifications(
  userId: number,
  limit = 40,
  exec: Executor = db,
): Promise<NotificationWithActor[]> {
  const rows = await exec
    .select({
      notification: notifications,
      actor: {
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarHue: users.avatarHue,
        isVerified: users.isVerified,
        karma: users.karma,
      },
    })
    .from(notifications)
    .leftJoin(users, eq(users.id, notifications.actorId))
    .where(visibleNotification(userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r.notification,
    actor: r.actor?.id ? (r.actor as AuthorSummary) : null,
  }));
}

export async function markNotificationsAsRead(
  userId: number,
  notificationIds?: number[],
  exec: Executor = db,
): Promise<void> {
  if (notificationIds && notificationIds.length > 0) {
    await exec
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), inArray(notifications.id, notificationIds)));
  } else {
    await exec
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  }
}
