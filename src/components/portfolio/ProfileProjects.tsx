import { ExternalLink, GitBranch } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { PublicProject } from "@/lib/portfolio-input";
import { routes } from "@/lib/utils";
import { ProjectModeration } from "./ProjectModeration";

export function ProfileProjects({ projects, owner, canModerate }: {
  projects: PublicProject[];
  owner: boolean;
  canModerate: boolean;
}) {
  return (
    <section aria-labelledby="profile-projects-heading" className="space-y-3">
      <div className="panel flex flex-wrap items-center justify-between gap-3 rounded-lg p-4">
        <div>
          <h2 id="profile-projects-heading" className="display text-[18px]">Selected projects</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">Work samples shared by this practitioner.</p>
        </div>
        {owner && <Link href={routes.settingsProjects()} className="btn btn-sm">Manage projects</Link>}
      </div>
      {projects.length === 0 ? (
        <p className="panel rounded-lg px-5 py-8 text-center text-[13px] text-ink-3">No public projects yet.</p>
      ) : (
        <ol className="space-y-3">
          {projects.map((project) => (
            <li key={project.id}>
              <article className="panel overflow-hidden rounded-lg" aria-labelledby={`project-title-${project.id}`}>
                {project.coverUrl && (
                  // Serve directly from the gated route; an image optimizer must not cache a private or withdrawn cover.
                  <Image unoptimized src={project.coverUrl} width={960} height={540} alt={project.coverAlt ?? ""}
                    className="aspect-video w-full border-b border-line bg-sunken object-contain" />
                )}
                <div className="space-y-3 p-4 sm:p-5">
                  <h3 id={`project-title-${project.id}`} className="display text-[18px] [overflow-wrap:anywhere]">{project.title}</h3>
                  <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-2 [overflow-wrap:anywhere]">{project.description}</p>
                  {project.roleOutcome && (
                    <div>
                      <h4 className="eyebrow mb-1 text-ink-3">Role &amp; outcome</h4>
                      <p className="whitespace-pre-wrap text-[13px] text-ink-2 [overflow-wrap:anywhere]">{project.roleOutcome}</p>
                    </div>
                  )}
                  <ul aria-label="Technologies" className="flex flex-wrap gap-1.5">
                    {project.techTags.map((tag) => <li className="tag tag-verdigris normal-case" key={tag}>{tag}</li>)}
                  </ul>
                  {(project.liveUrl || project.repoUrl || canModerate) && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                      {project.liveUrl && <a className="btn btn-sm" href={project.liveUrl} target="_blank" rel="noopener noreferrer">Live project <ExternalLink size={12} aria-hidden="true" /></a>}
                      {project.repoUrl && <a className="btn btn-sm" href={project.repoUrl} target="_blank" rel="noopener noreferrer"><GitBranch size={12} aria-hidden="true" /> Repository</a>}
                      {canModerate && <ProjectModeration id={project.id} action="hide" />}
                    </div>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
