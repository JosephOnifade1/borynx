import { handler, privateJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { parseLeadPaging } from "@/lib/lead-discovery";
import { listSavedLeads } from "@/lib/lead-feed";

export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  const user = await requireUser();
  return privateJson(await listSavedLeads(user.id, parseLeadPaging(req.nextUrl.searchParams, "saved")));
});
