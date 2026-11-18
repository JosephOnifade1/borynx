"use client";

import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Bookmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useSession } from "@/components/providers";
import { api, ClientError, queryKeys } from "@/lib/client";
import type { FeedLead, LeadFeedPage } from "@/lib/types";
import { cn, routes } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

export function LeadSaveButton({ leadId, saved: initial = false }: { leadId: FeedLead["id"]; saved?: boolean }) {
  const router = useRouter();
  const viewer = useSession();
  const query = useQueryClient();
  const notify = useUiStore((s) => s.notify);
  const [refreshing, startTransition] = useTransition();
  const pressed = Boolean(viewer && initial);
  const mutation = useMutation({
    mutationFn: (wantSaved: boolean) => api<{ saved: boolean }>(`/api/leads/${leadId}/save`, { method: wantSaved ? "PUT" : "DELETE" }),
    onSuccess: async ({ saved }) => {
      if (!viewer) return;
      const boards = { queryKey: ["leads", viewer.id] };
      query.setQueriesData<InfiniteData<LeadFeedPage>>(boards, (data) => data && ({ ...data, pages: data.pages.map((page) => ({
        ...page, items: page.items.map((lead) => lead.id === leadId ? { ...lead, saved } : lead),
      })) }));
      // Also refresh the server-rendered detail and cached route payloads.
      startTransition(() => router.refresh());
      notify(saved ? "Saved to your private leads" : "Removed from saved leads", "success");
      await Promise.all([query.invalidateQueries(boards), query.invalidateQueries({ queryKey: queryKeys.savedLeads(viewer.id) })]);
    },
    onError: (error) => notify(error instanceof ClientError ? error.message : "Could not update saved leads", "error"),
  });

  function toggle() {
    if (!viewer) {
      router.push(`${routes.login()}?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    if (!mutation.isPending && !refreshing) mutation.mutate(!pressed);
  }

  return (
    <button type="button" onClick={toggle} disabled={mutation.isPending || refreshing} aria-label="Save lead" aria-pressed={pressed}
      title={pressed ? "Remove from saved leads" : "Save to your private leads"}
      className={cn("btn btn-ghost btn-sm", pressed ? "text-gold" : "text-ink-3")}>
      <Bookmark size={13} fill={pressed ? "currentColor" : "none"} aria-hidden="true" /> {pressed ? "Saved" : "Save"}
    </button>
  );
}
