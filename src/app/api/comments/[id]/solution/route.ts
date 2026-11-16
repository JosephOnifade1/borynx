import { NextRequest } from "next/server";
import { handler, num } from "@/lib/api";
import { requireActor } from "@/lib/auth";
import { markSolution } from "@/lib/services";

export const dynamic = "force-dynamic";

export const POST = handler(async (_req: NextRequest, { params }) => {
  const actor = await requireActor();
  return Response.json(await markSolution(num(params.id), actor));
});
