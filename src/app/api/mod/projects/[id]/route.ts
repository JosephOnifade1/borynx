import { requireStaff } from "@/lib/auth";
import { moderateProject } from "@/lib/portfolio";
import { portfolioHandler, projectJson, readProjectJson } from "@/lib/portfolio-http";
import { parseProjectDecision, parseProjectId } from "@/lib/portfolio-input";

export const dynamic = "force-dynamic";

export const PATCH = portfolioHandler(async (req, { params }) => {
  const actor = await requireStaff();
  const id = parseProjectId(params.id);
  const decision = parseProjectDecision(await readProjectJson(req));
  return projectJson(await moderateProject(actor.id, id, decision));
});
