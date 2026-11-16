import { NextRequest } from "next/server";
import { handler } from "@/lib/api";
import { searchAll } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const results = q.trim() ? await searchAll(q) : [];
  return Response.json({ results });
});
