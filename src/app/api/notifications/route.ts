import { NextRequest } from "next/server";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getUnreadNotificationCount, listNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "40"), 100);

  const [items, unreadCount] = await Promise.all([
    listNotifications(user.id, limit),
    getUnreadNotificationCount(user.id),
  ]);

  return Response.json({
    notifications: items,
    unreadCount,
  });
});
