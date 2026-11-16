import { NextRequest } from "next/server";
import { handler, num, readJson } from "@/lib/api";
import { requireActor } from "@/lib/auth";
import { castVote } from "@/lib/services";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: NextRequest, { params }) => {
  const actor = await requireActor();
  const { value } = await readJson<{ value?: number }>(req);
  const v = value === 1 ? 1 : value === -1 ? -1 : 0;
  const result = await castVote(actor, "post", num(params.id), v);
  return Response.json(result);
});
