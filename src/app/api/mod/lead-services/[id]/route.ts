import { assertSameOrigin, handler, privateJson } from "@/lib/api";
import { HttpError, requireVerifiedActor } from "@/lib/auth";
import { parseLeadId } from "@/lib/lead-access";
import { parseServiceAction } from "@/lib/lead-service-input";
import { updateLeadService } from "@/lib/lead-services";
import { readBoundedJson } from "@/lib/request-body";

export const dynamic = "force-dynamic";

export const PATCH = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const admin = await requireVerifiedActor();
  if (admin.user.role !== "admin") throw new HttpError(403, "Administrator access required", "forbidden");
  const id = parseLeadId(params.id);
  const action = parseServiceAction(await readBoundedJson(req, 1024));
  return privateJson(await updateLeadService(id, admin.user.id, action));
});
