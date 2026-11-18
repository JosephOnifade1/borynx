"use client";

import Image from "next/image";
import { useEffect, useId, useState } from "react";
import { Dialog } from "@/components/shell/Dialog";
import { getStoredToken } from "@/lib/browser";
import { ClientError } from "@/lib/client";
import { PROJECT_LIMITS, type OwnedProject, type ProjectFields } from "@/lib/portfolio-input";

type EditorValues = { [Key in keyof ProjectFields]: string };

function PrivateCover({ url, alt }: { url: string; alt: string }) {
  const [loaded, setLoaded] = useState<{ source: string; objectUrl: string | null }>();
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    const token = getStoredToken();
    // <img> cannot carry the header session transport used by disposable previews.
    void fetch(url, { signal: controller.signal, credentials: "same-origin", cache: "no-store", headers: token ? { "x-bx-session": token } : {} })
      .then(async (response) => {
        if (!response.ok || response.headers.get("content-type") !== "image/webp") throw new Error("Cover unavailable");
        const image = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(image);
        setLoaded({ source: url, objectUrl });
      }).catch(() => { if (!controller.signal.aborted) setLoaded({ source: url, objectUrl: null }); });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (loaded?.source !== url) return <p role="status" className="text-[12.5px] text-ink-3">Loading private preview…</p>;
  if (!loaded.objectUrl) return <p className="text-[12.5px] text-ink-3">Cover preview unavailable.</p>;
  return <Image unoptimized src={loaded.objectUrl} alt={alt} width={480} height={270} className="aspect-video w-full rounded-md border border-line bg-sunken object-contain" />;
}

export function ProjectEditor({ project, pending, error, onClose, onSave, onUpload, onRemoveCover }: {
  project?: OwnedProject;
  pending: boolean;
  error: Error | null;
  onClose: () => void;
  onSave: (fields: ProjectFields) => void;
  onUpload: (form: FormData) => void;
  onRemoveCover: () => void;
}) {
  const id = useId();
  const [values, setValues] = useState<EditorValues>(() => ({
    title: project?.title ?? "", description: project?.description ?? "", roleOutcome: project?.roleOutcome ?? "",
    liveUrl: project?.liveUrl ?? "", repoUrl: project?.repoUrl ?? "", techTags: project?.techTags.join(", ") ?? "",
  }));
  const fields = error instanceof ClientError ? error.fields : undefined;
  const fieldProps = (field: keyof EditorValues) => ({
    id: `${id}-${field}`, value: values[field], className: "field text-[13.5px]",
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((prev) => ({ ...prev, [field]: event.target.value })),
    "aria-invalid": fields?.[field] ? true : undefined,
    "aria-describedby": fields?.[field] ? `${id}-${field}-error` : undefined,
  });
  const errorFor = (field: string) => fields?.[field] && <p id={`${id}-${field}-error`} className="mt-1 text-[12px] text-danger">{fields[field]}</p>;

  return (
    <Dialog open onClose={onClose} title={project ? "Edit project" : "New project"}
      description={project ? "Details and cover can be saved separately." : "Start with a private draft. You choose when to publish it."}>
      <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
        <form id={`${id}-details`} className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          if (!pending) onSave({
            title: values.title, description: values.description, roleOutcome: values.roleOutcome.trim() || null,
            liveUrl: values.liveUrl.trim() || null, repoUrl: values.repoUrl.trim() || null,
            techTags: values.techTags.split(",").map((tag) => tag.trim()).filter(Boolean),
          });
        }}>
          <div>
            <label htmlFor={`${id}-title`} className="eyebrow mb-1 block">Project title</label>
            <input {...fieldProps("title")} required minLength={3} maxLength={PROJECT_LIMITS.title} placeholder="Checkout accessibility rebuild" />
            {errorFor("title")}
          </div>
          <div>
            <label htmlFor={`${id}-description`} className="eyebrow mb-1 block">Description</label>
            <textarea {...fieldProps("description")} required minLength={20} maxLength={PROJECT_LIMITS.description} rows={4}
              placeholder="Describe what you built, who it helped, and what changed." />
            {errorFor("description")}
          </div>
          <div>
            <label htmlFor={`${id}-roleOutcome`} className="eyebrow mb-1 block">Role &amp; outcome (optional)</label>
            <textarea {...fieldProps("roleOutcome")} maxLength={PROJECT_LIMITS.roleOutcome} rows={2} />
            {errorFor("roleOutcome")}
          </div>
          <div>
            <label htmlFor={`${id}-techTags`} className="eyebrow mb-1 block">Technology tags</label>
            <input {...fieldProps("techTags")} required maxLength={PROJECT_LIMITS.tags * (PROJECT_LIMITS.tag + 2)} placeholder="React, accessibility, Node.js" />
            <p className="mt-1 text-[12px] text-ink-3">Add 1–8 tags, separated by commas.</p>
            {errorFor("techTags")}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor={`${id}-liveUrl`} className="eyebrow mb-1 block">Live project URL (optional)</label>
              <input {...fieldProps("liveUrl")} inputMode="url" maxLength={PROJECT_LIMITS.url} placeholder="https://example.com" />
              {errorFor("liveUrl")}
            </div>
            <div className="min-w-0">
              <label htmlFor={`${id}-repoUrl`} className="eyebrow mb-1 block">Repository URL (optional)</label>
              <input {...fieldProps("repoUrl")} inputMode="url" maxLength={PROJECT_LIMITS.url} placeholder="https://github.com/…" />
              {errorFor("repoUrl")}
            </div>
          </div>
        </form>
        {project && (
          <section aria-labelledby={`${id}-cover-heading`} className="space-y-2 border-t border-line pt-3">
            <h3 id={`${id}-cover-heading`} className="display text-[15px]">Cover image</h3>
            {project.coverUrl && <PrivateCover url={project.coverUrl} alt={project.coverAlt ?? ""} />}
            <form className="space-y-2" key={project.coverUrl ?? "empty"} onSubmit={(event) => {
              event.preventDefault();
              if (!pending) onUpload(new FormData(event.currentTarget));
            }}>
              <p className="text-[12px] text-ink-3">Optional. Choose a PNG, JPEG or WebP up to 3 MiB. We remove image metadata.</p>
              <label htmlFor={`${id}-cover-file`} className="eyebrow block">Choose cover</label>
              <input id={`${id}-cover-file`} name="file" type="file" accept="image/png,image/jpeg,image/webp" required
                aria-invalid={fields?.file ? true : undefined} aria-describedby={fields?.file ? `${id}-file-error` : undefined}
                className="field max-w-full text-[12.5px] file:mr-2 file:max-w-full file:text-[12px]" />
              {errorFor("file")}
              <label htmlFor={`${id}-cover-alt`} className="eyebrow block">Cover description (alt text)</label>
              <input id={`${id}-cover-alt`} name="altText" maxLength={PROJECT_LIMITS.altText} defaultValue={project.coverAlt ?? ""}
                aria-invalid={fields?.altText ? true : undefined} aria-describedby={fields?.altText ? `${id}-altText-error` : undefined}
                className="field text-[13px]" placeholder="Describe what the image shows" />
              {errorFor("altText")}
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn btn-sm" disabled={pending}>{project.coverUrl ? "Replace cover" : "Upload cover"}</button>
                {project.coverUrl && <button type="button" className="btn btn-sm btn-ghost" disabled={pending} onClick={onRemoveCover}>Remove cover</button>}
              </div>
            </form>
          </section>
        )}
      </div>
      <div className="shrink-0 space-y-2 border-t border-line bg-sunken/40 px-5 py-3">
        {error && <p role="alert" className="text-[12.5px] text-danger">{error.message}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={onClose}>Close</button>
          <button type="submit" form={`${id}-details`} className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : project ? "Save details" : "Save draft"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
