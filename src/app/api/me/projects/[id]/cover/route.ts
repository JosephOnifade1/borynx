import { requireActor } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { checkProjectOwner, removeProjectCover, setProjectCover } from "@/lib/portfolio";
import { sanitizeProjectCover } from "@/lib/portfolio-covers";
import { portfolioHandler, PRIVATE_PROJECT_HEADERS, projectJson, readCoverForm } from "@/lib/portfolio-http";
import { parseCoverAlt, parseProjectId, PROJECT_LIMITS } from "@/lib/portfolio-input";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Bound concurrent decodes without holding an owner lock while reading an upload.
let activeUploads = 0;

export const POST = portfolioHandler(async (req, { params }) => {
  const owner = await requireActor();
  const id = parseProjectId(params.id);
  await checkProjectOwner(owner.id, id);
  if (activeUploads >= 2) throw new HttpError(429, "Other covers are being processed. Try again shortly.", "uploads_busy", undefined, 2);
  activeUploads++;
  try {
    const form = await readCoverForm(req, PROJECT_LIMITS.coverBytes);
    const altText = parseCoverAlt(form.altText);
    const bytes = await sanitizeProjectCover(Buffer.from(await form.file.arrayBuffer()));
    return projectJson(await setProjectCover(owner.id, id, bytes, altText));
  } finally {
    activeUploads--;
  }
});

export const DELETE = portfolioHandler(async (_req, { params }) => {
  const owner = await requireActor();
  await removeProjectCover(owner.id, parseProjectId(params.id));
  return new Response(null, { status: 204, headers: PRIVATE_PROJECT_HEADERS });
});
