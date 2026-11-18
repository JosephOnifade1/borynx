import { getCurrentUser } from "@/lib/auth";
import { readProjectCover } from "@/lib/portfolio";
import { portfolioHandler, PRIVATE_PROJECT_HEADERS } from "@/lib/portfolio-http";
import { parseProjectId } from "@/lib/portfolio-input";

export const dynamic = "force-dynamic";

export const GET = portfolioHandler(async (_req, { params }) => {
  const viewer = await getCurrentUser();
  const bytes = await readProjectCover(parseProjectId(params.id), viewer?.id);
  return new Response(new Uint8Array(bytes), { headers: {
    ...PRIVATE_PROJECT_HEADERS,
    "Content-Type": "image/webp",
    "Content-Length": String(bytes.byteLength),
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  } });
});
