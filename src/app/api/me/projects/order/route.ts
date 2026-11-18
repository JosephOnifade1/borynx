import { requireActor } from "@/lib/auth";
import { reorderProjects } from "@/lib/portfolio";
import { portfolioHandler, projectJson, readProjectJson } from "@/lib/portfolio-http";
import { parseProjectOrder } from "@/lib/portfolio-input";

export const dynamic = "force-dynamic";

export const PUT = portfolioHandler(async (req) => {
  const owner = await requireActor();
  const ids = parseProjectOrder(await readProjectJson(req));
  return projectJson({ items: await reorderProjects(owner.id, ids) });
});
