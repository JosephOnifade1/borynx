import { handler } from "@/lib/api";
import { requireVerifiedActor } from "@/lib/auth";
import { readEmailJson } from "@/lib/email-auth/input";
import { confirmIntake } from "@/lib/email-auth/intakes";
import { requireEmailAuth } from "@/lib/email-auth/policy";
import { submissionResponse } from "@/lib/lead-submissions";

export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  const config = requireEmailAuth(req);
  const session = await requireVerifiedActor();
  const { intakeId } = await readEmailJson(req);
  const result = await confirmIntake(config, session, intakeId);
  return submissionResponse(result.lead, result.status);
});
