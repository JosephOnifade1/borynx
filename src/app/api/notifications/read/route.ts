import { NextRequest } from "next/server";
import { handler, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getUnreadNotificationCount, markNotificationsAsRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  let ids: number[] | undefined;
  try {
    const body = await readJson<{ ids?: number[] }>(req);
    if (Array.isArray(body.ids)) {
      ids = body.ids.filter((n) => typeof n === "number");
    }
  } catch {
    // Empty body is valid: marks all as read
  }

  await markNotificationsAsRead(user.id, ids);
  const unreadCount = await getUnreadNotificationCount(user.id);

  return Response.json({ ok: true, unreadCount });
});
