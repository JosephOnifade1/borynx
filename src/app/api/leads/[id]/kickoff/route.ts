import { assertSameOrigin, handler, privateJson } from "@/lib/api";
import { requireActor } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { parseLeadId } from "@/lib/lead-access";
import { acknowledgeLeadKickoff, sendLeadKickoff } from "@/lib/lead-kickoff";
import { assertKickoffAcknowledgement, parseKickoffInput } from "@/lib/lead-kickoff-input";
import { readBoundedJson } from "@/lib/request-body";

export const dynamic = "force-dynamic";

const kickoffHandler: typeof handler = (fn) => handler(async (req, ctx) => {
  assertSameOrigin(req);
  try {
    return await fn(req, ctx);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // Driver errors can contain SQL parameters. Never log contact or kickoff text.
    console.error("[borynx] Kickoff request failed");
    throw new HttpError(500, "Kickoff is temporarily unavailable.", "kickoff_failed");
  }
});

export const POST = kickoffHandler(async (req, { params }) => {
  const actor = await requireActor();
  const id = parseLeadId(params.id);
  const input = parseKickoffInput(await readBoundedJson(req, 16 * 1024));
  return privateJson(await sendLeadKickoff(id, actor.id, input), 201);
});

export const PATCH = kickoffHandler(async (req, { params }) => {
  const actor = await requireActor();
  const id = parseLeadId(params.id);
  assertKickoffAcknowledgement(await readBoundedJson(req, 1_024));
  return privateJson(await acknowledgeLeadKickoff(id, actor.id));
});
