"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Dialog } from "@/components/shell/Dialog";
import { api, ClientError } from "@/lib/client";
import { routes } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

export function PostActions({ postId, canEdit }: { postId: number; canEdit: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const notify = useUiStore((state) => state.notify);
  const mutation = useMutation({
    mutationFn: () => api<{ href: string }>(`/api/posts/${postId}`, { method: "DELETE" }),
    onSuccess: ({ href }) => {
      setConfirming(false);
      queryClient.removeQueries({ queryKey: ["posts"] });
      queryClient.removeQueries({ queryKey: ["search"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      notify("Post deleted", "success");
      router.replace(href);
      router.refresh();
    },
  });

  return (
    <div
      className="relative shrink-0"
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button ref={triggerRef} type="button" className="btn btn-ghost min-h-11 min-w-11" aria-label="Post actions" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>
        <Ellipsis size={18} aria-hidden="true" />
      </button>
      {open && (
        <div id={id} className="panel-raised absolute right-0 top-full z-20 mt-1 min-w-36 rounded-md border border-line p-1 shadow-lg">
          {canEdit && <Link href={routes.postEdit(postId)} className="btn btn-ghost w-full justify-start"><Pencil size={14} /> Edit post</Link>}
          <button type="button" className="btn btn-ghost w-full justify-start text-danger" onClick={() => {
            triggerRef.current?.focus();
            setOpen(false);
            mutation.reset();
            setConfirming(true);
          }}><Trash2 size={14} /> Delete post</button>
        </div>
      )}
      <Dialog
        open={confirming}
        onClose={() => { if (!mutation.isPending) setConfirming(false); }}
        title="Delete this post?"
        description="Your title and text will be removed. Existing replies will stay, and new replies will be closed. You can’t undo this here."
        initialFocusRef={cancelRef}
      >
        <div className="space-y-3 px-5 py-4">
          {mutation.isError && <p role="alert" className="text-[13px] text-danger">{mutation.error instanceof ClientError ? mutation.error.message : "Could not delete the post. Please try again."}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button ref={cancelRef} type="button" className="btn" onClick={() => setConfirming(false)} disabled={mutation.isPending}>Cancel</button>
            <button type="button" className="btn btn-danger" onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? "Deleting…" : "Delete post"}</button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
