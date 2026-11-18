"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientError } from "@/lib/client";
import { POST_KIND_LABEL } from "@/lib/constants";
import { serializeThreadBody } from "@/lib/thread-editor";
import { cn, routes } from "@/lib/utils";
import { useUiStore } from "@/store/ui";
import { ThreadEditor, useThreadEditor } from "./ThreadEditor";

interface EditPost {
  id: number;
  href: string;
  title: string;
  content: JSONContent;
  editedAt: string | null;
}

export function PostComposer({ spaceSlug, spaceName, edit }: { spaceSlug: string; spaceName: string; edit?: EditPost }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const notify = useUiStore((state) => state.notify);
  const [title, setTitle] = useState(edit?.title ?? "");
  const [kind, setKind] = useState<keyof typeof POST_KIND_LABEL>("discussion");
  const [error, setError] = useState("");
  const editor = useThreadEditor(edit?.content);
  const mutation = useMutation({
    mutationFn: (body: string | undefined) => api<{ href: string; newBadges?: string[]; flagged: boolean; changed?: boolean }>(
      edit ? `/api/posts/${edit.id}` : "/api/posts",
      edit
        ? { method: "PATCH", json: { title, body, editedAt: edit.editedAt } }
        : { method: "POST", json: { spaceSlug, title, body, kind } },
    ),
    onSuccess: (result) => {
      const message = edit ? (result.changed === false ? "No changes to save" : "Post updated") : "Thread published";
      notify(result.flagged ? `${message} — queued for moderator review` : message, "success");
      result.newBadges?.forEach((badge) => notify(`Badge unlocked: ${badge}`, "success"));
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
      void queryClient.invalidateQueries({ queryKey: ["search"] });
      if (edit) router.replace(result.href);
      else router.push(result.href);
      router.refresh();
    },
    onError: (cause) => setError(cause instanceof ClientError ? cause.message : `Failed to ${edit ? "save changes" : "publish"}. Your draft is still here.`),
  });

  return (
    <form
      className="space-y-5 px-5 py-6 sm:px-8"
      onSubmit={(event) => {
        event.preventDefault();
        if (!editor || mutation.isPending) return;
        const serialized = serializeThreadBody(editor.state.doc);
        // An editor transaction can add a trailing empty paragraph without changing the text.
        const sameBody = edit && serialized === serializeThreadBody(editor.schema.nodeFromJSON(edit.content));
        const body = sameBody ? undefined : serialized;
        if (!sameBody && (!editor.getText().trim() || !body)) {
          setError(`Write a thread body before ${edit ? "saving" : "publishing"}.`);
          editor.commands.focus();
          return;
        }
        if (body !== undefined && body.length > 20_000) {
          setError("The thread body, including formatting, must be 20,000 characters or less.");
          return;
        }
        setError("");
        mutation.mutate(body);
      }}
    >
      {!edit && <fieldset>
        <legend className="eyebrow mb-2">Thread type</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(POST_KIND_LABEL) as Array<keyof typeof POST_KIND_LABEL>).map((key) => (
            <label key={key} className={cn("cursor-pointer rounded-md border px-3 py-2 text-[13px]", kind === key ? "border-ember bg-ember-soft/40" : "border-line hover:border-line-strong")}>
              <input type="radio" name="kind" className="sr-only" checked={kind === key} onChange={() => setKind(key)} />
              <span className="block font-semibold">{POST_KIND_LABEL[key]}</span>
              <span className="num block text-[10.5px] text-ink-3">{key === "resource" || key === "help" ? "1.5× karma" : "1× karma"}</span>
            </label>
          ))}
        </div>
      </fieldset>}
      <label className="block">
        <span className="eyebrow">Title</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} className="field mt-1.5 w-full" placeholder={`A specific, searchable title for ${spaceName}`} minLength={8} maxLength={180} required />
      </label>
      <div>
        <p className="eyebrow mb-1.5">Body</p>
        <ThreadEditor editor={editor} />
      </div>
      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11.5px] text-ink-3">{edit ? "If you’re changing the topic, start a new thread instead so existing replies still make sense." : "Submissions pass an automated spam/scam filter and a 3-per-10-minute rate limit."}</p>
        <div className="flex gap-2">
          <Link href={edit?.href ?? routes.space(spaceSlug)} className="btn">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={!editor || mutation.isPending}>
            {edit ? (mutation.isPending ? "Saving…" : "Save changes") : (mutation.isPending ? "Publishing…" : "Publish thread")}
          </button>
        </div>
      </div>
    </form>
  );
}
