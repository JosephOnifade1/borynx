import { assertSameOrigin, handler, privateJson } from "@/lib/api";
import { requireVerifiedActor } from "@/lib/auth";
import { parseLeadId } from "@/lib/lead-access";
import { parseServiceRequest } from "@/lib/lead-service-input";
import { requestLeadService } from "@/lib/lead-services";
import { readBoundedJson } from "@/lib/request-body";

export const dynamic = "force-dynamic";

export const POST = handler(async (req, { params }) => {
  assertSameOrigin(req);
  const buyer = await requireVerifiedActor();
  const leadId = parseLeadId(params.id);
  const kind = parseServiceRequest(await readBoundedJson(req, 1024));
  const { order, status } = await requestLeadService(leadId, buyer, kind);
  return privateJson(order, status);
});
