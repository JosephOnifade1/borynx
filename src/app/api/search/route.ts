import { NextRequest } from "next/server";
import { handler } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { searchAll } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const results = q.trim() ? await searchAll(q, await getCurrentUser()) : [];
  return Response.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
});
