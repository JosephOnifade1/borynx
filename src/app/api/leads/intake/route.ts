import { handler } from "@/lib/api";
import { parseLeadIntake, readEmailJson } from "@/lib/email-auth/input";
import { requireEmailAuth } from "@/lib/email-auth/policy";
import { requestEmailLink } from "@/lib/email-auth/send";

export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  const config = requireEmailAuth(req, { send: true });
  const { email, ...intake } = parseLeadIntake(await readEmailJson(req, 128 * 1024));
  return requestEmailLink(config, req, email, "/", intake);
});
