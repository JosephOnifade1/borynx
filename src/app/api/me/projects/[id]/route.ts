import { requireActor } from "@/lib/auth";
import { deleteProject, updateProject } from "@/lib/portfolio";
import { portfolioHandler, PRIVATE_PROJECT_HEADERS, projectJson, readProjectJson } from "@/lib/portfolio-http";
import { parseProjectId, parseProjectPatch } from "@/lib/portfolio-input";

export const dynamic = "force-dynamic";

export const PATCH = portfolioHandler(async (req, { params }) => {
  const owner = await requireActor();
  const id = parseProjectId(params.id);
  const fields = parseProjectPatch(await readProjectJson(req));
  return projectJson({ project: await updateProject(owner.id, id, fields) });
});

export const DELETE = portfolioHandler(async (_req, { params }) => {
  const owner = await requireActor();
  await deleteProject(owner.id, parseProjectId(params.id));
  return new Response(null, { status: 204, headers: PRIVATE_PROJECT_HEADERS });
});
