import { assertSameOrigin, handler, privateJson } from "@/lib/api";
import { requireActor, requireUser } from "@/lib/auth";
import { parseLeadId } from "@/lib/lead-access";
import { saveLead, unsaveLead } from "@/lib/lead-saves";

export const dynamic = "force-dynamic";

export const PUT = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireActor();
  await saveLead(user.id, parseLeadId(params.id));
  return privateJson({ saved: true });
});

export const DELETE = handler(async (req, { params }) => {
  assertSameOrigin(req);
  // A restricted account can still remove its own private bookmarks.
  const user = await requireUser();
  await unsaveLead(user.id, parseLeadId(params.id));
  return privateJson({ saved: false });
});
