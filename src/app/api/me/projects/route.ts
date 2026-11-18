import { requireActor, requireUser } from "@/lib/auth";
import { createProject, listOwnedProjects } from "@/lib/portfolio";
import { portfolioHandler, projectJson, readProjectJson } from "@/lib/portfolio-http";
import { parseProjectCreate } from "@/lib/portfolio-input";

export const dynamic = "force-dynamic";

export const GET = portfolioHandler(async () => {
  const owner = await requireUser();
  return projectJson({ items: await listOwnedProjects(owner.id) });
});

export const POST = portfolioHandler(async (req) => {
  const owner = await requireActor();
  const fields = parseProjectCreate(await readProjectJson(req));
  return projectJson({ project: await createProject(owner.id, fields) }, 201);
});
