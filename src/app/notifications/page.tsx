import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { NotificationsInbox } from "@/components/notifications/NotificationsInbox";
import { PageFrame } from "@/components/PageFrame";
import { getCurrentUser } from "@/lib/auth";
import { getUnreadNotificationCount, listNotifications } from "@/lib/notifications";
import { routes } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Notifications — Borynx",
  description: "Your Borynx activity inbox, replies, bids, and followers.",
};

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(routes.login());
  }

  const [notifications, unreadCount] = await Promise.all([
    listNotifications(user.id, 60),
    getUnreadNotificationCount(user.id),
  ]);

  return (
    <PageFrame
      stream
      header={
        <div className="panel flex items-center justify-between rounded-lg p-5">
          <div>
            <p className="eyebrow">Activity & Updates</p>
            <h1 className="display mt-1 text-[24px]">Notifications</h1>
          </div>
          {unreadCount > 0 && (
            <span className="tag tag-ember text-[12px] font-semibold">
              {unreadCount} unread
            </span>
          )}
        </div>
      }
    >
      <NotificationsInbox
        initialData={{
          notifications,
          unreadCount,
        }}
      />
    </PageFrame>
  );
}
