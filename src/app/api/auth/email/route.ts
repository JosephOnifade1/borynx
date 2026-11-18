import { handler } from "@/lib/api";
import { parseEmail, readEmailJson } from "@/lib/email-auth/input";
import { requireEmailAuth } from "@/lib/email-auth/policy";
import { requestEmailLink } from "@/lib/email-auth/send";
import { safeDestination } from "@/lib/safe-destination";

export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  const config = requireEmailAuth(req, { send: true });
  const body = await readEmailJson(req);
  return requestEmailLink(config, req, parseEmail(body.email), safeDestination(body.next));
});
