"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog } from "@/components/shell/Dialog";
import { api, ClientError } from "@/lib/client";
import { PROJECT_LIMITS, type OwnedProject, type ProjectFields } from "@/lib/portfolio-input";
import { useUiStore } from "@/store/ui";
import { ProjectEditor } from "./ProjectEditor";

const endpoint = "/api/me/projects";
type Action =
  | { kind: "create"; fields: ProjectFields }
  | { kind: "edit"; id: number; fields: ProjectFields }
  | { kind: "visibility"; id: number; isPublished: boolean }
  | { kind: "order"; ids: number[] }
  | { kind: "upload"; id: number; form: FormData }
  | { kind: "removeCover"; id: number }
  | { kind: "delete"; id: number };

async function writeProject(action: Action) {
  switch (action.kind) {
    case "create": return api(endpoint, { method: "POST", json: action.fields });
    case "edit": return api(`${endpoint}/${action.id}`, { method: "PATCH", json: action.fields });
    case "visibility": return api(`${endpoint}/${action.id}`, { method: "PATCH", json: { isPublished: action.isPublished } });
    case "order": return api(`${endpoint}/order`, { method: "PUT", json: { ids: action.ids } });
    case "upload": return api(`${endpoint}/${action.id}/cover`, { method: "POST", body: action.form });
    case "removeCover": return api<void>(`${endpoint}/${action.id}/cover`, { method: "DELETE" });
    case "delete": return api<void>(`${endpoint}/${action.id}`, { method: "DELETE" });
  }
}

const feedback: Record<Action["kind"], string> = {
  create: "Draft saved", edit: "Project details saved", visibility: "Project visibility updated", order: "Project order saved",
  upload: "Cover saved", removeCover: "Cover removed", delete: "Project deleted",
};

export function ProjectsManager({ ownerId, initialItems, restricted }: { ownerId: number; initialItems: OwnedProject[]; restricted: boolean }) {
  const [editor, setEditor] = useState<"new" | number | null>(null);
  const [toDelete, setToDelete] = useState<OwnedProject | null>(null);
  const router = useRouter();
  const notify = useUiStore((s) => s.notify);
  const query = useQuery({
    queryKey: ["ownedProjects", ownerId],
    queryFn: () => api<{ items: OwnedProject[] }>(endpoint),
    initialData: { items: initialItems },
  });
  const items = query.data.items;
  const mutation = useMutation({
    mutationFn: writeProject,
    onSuccess: async (_result, action) => {
      const next = await query.refetch();
      if (action.kind === "create" || action.kind === "edit") setEditor(null);
      if (action.kind === "delete") setToDelete(null);
      if (next.isError) notify("Saved, but the project list could not reload. Try Refresh list.", "error");
      else notify(feedback[action.kind], "success");
      router.refresh();
    },
    onError: async (error) => {
      if (error instanceof ClientError && error.status === 409) await query.refetch();
    },
  });

  const blocked = restricted || mutation.isPending;
  const atLimit = items.length >= PROJECT_LIMITS.projects;
  const selected = typeof editor === "number" ? items.find((item) => item.id === editor) : undefined;
  const openEditor = (value: "new" | number) => { mutation.reset(); setEditor(value); };
  const move = (index: number, direction: -1 | 1) => {
    const other = index + direction;
    if (blocked || other < 0 || other >= items.length) return;
    const ids = items.map((item) => item.id);
    [ids[index], ids[other]] = [ids[other], ids[index]];
    mutation.mutate({ kind: "order", ids });
  };

  return (
    <section className="space-y-3" aria-labelledby="my-projects-heading">
      <div className="panel flex flex-wrap items-center justify-between gap-3 rounded-lg p-4 sm:p-5">
        <div>
          <h2 className="display text-[18px]" id="my-projects-heading">Your projects</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">{items.length} of {PROJECT_LIMITS.projects} · {items.filter((item) => item.isPublished && !item.hidden).length} public</p>
        </div>
        <button type="button" className="btn btn-primary" disabled={blocked || atLimit} onClick={() => openEditor("new")}><Plus size={14} aria-hidden="true" /> New project</button>
        {atLimit && <p className="w-full text-[12.5px] text-ink-3">You have six projects. Delete one before adding another.</p>}
        {restricted && <p className="w-full text-[12.5px] text-danger">Your account cannot make changes right now.</p>}
      </div>
      {query.isError && <div className="panel flex flex-wrap items-center gap-3 rounded-lg p-3 text-[13px]">
        <p role="alert">Couldn’t reload your project list.</p><button type="button" className="btn btn-sm" onClick={() => void query.refetch()}>Refresh list</button>
      </div>}
      {mutation.error && editor === null && !toDelete && <p className="panel rounded-lg p-3 text-[13px] text-danger" role="alert">{mutation.error.message}</p>}
      {items.length === 0 ? <div className="panel rounded-lg p-6 text-center">
        <p className="display text-[16px]">Add a work sample</p>
        <p className="mt-1 text-[13px] text-ink-3">Start with one project. No public repository or image is required.</p>
      </div> : (
        <ol className="space-y-3">
          {items.map((item, index) => (
            <li key={item.id} className="panel min-w-0 space-y-3 rounded-lg p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="eyebrow text-ink-3">Project {index + 1}</span>
                <span className={`tag ${item.hidden ? "tag-gold" : item.isPublished ? "tag-verdigris" : ""}`}>
                  {item.hidden ? "Hidden by staff" : item.isPublished ? "Published" : "Draft"}
                </span>
              </div>
              <div>
                <h3 className="display text-[17px] [overflow-wrap:anywhere]">{item.title}</h3>
                <p className="mt-1 line-clamp-2 text-[13px] text-ink-3 [overflow-wrap:anywhere]">{item.description}</p>
                {item.hidden && <p className="mt-1 text-[12px] text-ink-3">Only a moderator can restore public visibility.</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <button type="button" className="btn btn-sm" disabled={blocked} onClick={() => openEditor(item.id)} aria-label={`Edit ${item.title}`}>
                  <Pencil size={12} aria-hidden="true" /> Edit
                </button>
                <button type="button" className="btn btn-sm" disabled={blocked || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${item.title} up`}>
                  <ArrowUp size={12} aria-hidden="true" /> Up
                </button>
                <button type="button" className="btn btn-sm" disabled={blocked || index === items.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${item.title} down`}>
                  <ArrowDown size={12} aria-hidden="true" /> Down
                </button>
                <button type="button" className={`btn btn-sm ${item.isPublished ? "" : "btn-primary"}`} disabled={blocked}
                  aria-label={`${item.isPublished ? "Unpublish" : "Publish"} ${item.title}`}
                  onClick={() => mutation.mutate({ kind: "visibility", id: item.id, isPublished: !item.isPublished })}>
                  {item.isPublished ? "Unpublish" : "Publish"}
                </button>
                <button type="button" className="btn btn-sm btn-ghost text-danger" disabled={blocked} aria-label={`Delete ${item.title}`}
                  onClick={() => { mutation.reset(); setToDelete(item); }}>Delete</button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {(editor === "new" || selected) && (
        <ProjectEditor key={editor} project={selected} pending={blocked} error={mutation.error}
          onClose={() => { if (!mutation.isPending) setEditor(null); }}
          onSave={(fields) => mutation.mutate(selected ? { kind: "edit", id: selected.id, fields } : { kind: "create", fields })}
          onUpload={(form) => { if (selected) mutation.mutate({ kind: "upload", id: selected.id, form }); }}
          onRemoveCover={() => { if (selected) mutation.mutate({ kind: "removeCover", id: selected.id }); }} />
      )}
      {toDelete && (
        <Dialog open onClose={() => { if (!mutation.isPending) setToDelete(null); }} title="Delete project?"
          description="This permanently removes the project and its cover.">
          <div className="space-y-3 p-5">
            <p className="text-[13.5px] font-semibold [overflow-wrap:anywhere]">{toDelete.title}</p>
            {mutation.error && <p className="text-[13px] text-danger" role="alert">{mutation.error.message}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn btn-ghost" disabled={mutation.isPending} onClick={() => setToDelete(null)}>Cancel</button>
              <button type="button" className="btn btn-danger" disabled={blocked} onClick={() => mutation.mutate({ kind: "delete", id: toDelete.id })}>
                {mutation.isPending ? "Deleting…" : "Delete project"}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
