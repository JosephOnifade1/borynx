import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, users, type NewNotification, type Notification, type NotificationType } from "@/db/schema";
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

export async function getUnreadNotificationCount(userId: number, exec: Executor = db): Promise<number> {
  const [row] = await exec
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
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
    .where(eq(notifications.userId, userId))
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
