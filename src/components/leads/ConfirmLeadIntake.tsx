"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useHydrated } from "@/lib/browser";
import { api, ClientError } from "@/lib/client";
import { clearMatchingLeadDraft } from "@/lib/lead-draft";
import { routes } from "@/lib/utils";

export function ConfirmLeadIntake({ id, submissionKey, children }: { id: string; submissionKey: string; children: ReactNode }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const confirm = useMutation({
    mutationFn: () => api<{ href: string }>("/api/leads/intake/confirm", { method: "POST", json: { intakeId: id } }),
    onSuccess: ({ href }) => {
      clearMatchingLeadDraft(submissionKey);
      router.replace(href);
      router.refresh();
    },
  });
  const seconds = confirm.error instanceof ClientError ? confirm.error.retryAfter : undefined;
  return (
    <form method="post" className="space-y-4 px-4 py-5 sm:px-7 sm:py-6" aria-label="Confirm saved lead" onSubmit={(event) => { event.preventDefault(); if (hydrated && !confirm.isPending && !confirm.isSuccess) confirm.mutate(); }}>
      {children}
      {confirm.error && <p role="alert" className="rounded-md border border-danger/40 bg-danger-soft/30 px-3 py-2 text-[13px] text-danger">{confirm.error.message}{seconds && ` Try again in about ${Math.ceil(seconds / 60)} min.`}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <Link href={routes.leadNew()} className="btn">Start a new brief</Link>
        <button type="submit" className="btn btn-primary" disabled={!hydrated || confirm.isPending || confirm.isSuccess}>{confirm.isPending || confirm.isSuccess ? "Submitting…" : "Submit for review"}</button>
      </div>
    </form>
  );
}
