import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { routes } from "@/lib/utils";

/** `/me` → the signed-in user's canonical profile, or login with a return hint. */
export default async function MePage() {
  const user = await getCurrentUser();
  redirect(user ? routes.profile(user.username) : `${routes.login()}?next=/me`);
}
