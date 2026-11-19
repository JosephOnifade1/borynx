"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { api, ClientError } from "@/lib/client";
import { HttpError } from "@/lib/errors";
import { KICKOFF_LIMITS, parseKickoffInput, type KickoffInput } from "@/lib/lead-kickoff-input";

function useKickoffWrite(leadId: number) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [issue, setIssue] = useState<{ message: string; fields?: Record<string, string> } | null>(null);
  function report(error: unknown) {
    setIssue({ message: error instanceof Error ? error.message : "Could not update kickoff details.",
      fields: error instanceof ClientError || error instanceof HttpError ? error.fields : undefined });
  }
  // Keep entered contact information out of the shared client mutation cache.
  async function write(method: "POST" | "PATCH", json: KickoffInput | { action: "acknowledge" }, afterSave?: () => void) {
    if (pending || saved) return;
    setPending(true);
    setIssue(null);
    try {
      await api(`/api/leads/${leadId}/kickoff`, { method, json });
      afterSave?.();
      setSaved(true);
      router.refresh();
    } catch (error) {
      report(error);
      if (error instanceof ClientError && ["kickoff_exists", "kickoff_unavailable", "not_found", "restricted"].includes(error.code)) router.refresh();
    } finally {
      setPending(false);
    }
  }
  return { pending, saved, issue, clearIssue: () => setIssue(null), report, write };
}

export function KickoffComposer({ leadId }: { leadId: number }) {
  const id = useId();
  const { pending, saved, issue, clearIssue, report, write } = useKickoffWrite(leadId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    try {
      await write("POST", parseKickoffInput({ note: fields.get("note"), startDate: fields.get("startDate"), contact: fields.get("contact") }), () => form.reset());
    } catch (error) {
      report(error);
    }
  }
  if (saved) return <p role="status" className="mt-3 text-[13px] text-ink-2">Kickoff details sent to the winner.</p>;
  return (
    // Even before hydration, never let the browser put private fields in a GET URL.
    <form method="post" autoComplete="off" aria-label="Send kickoff details" className="mt-3" onSubmit={submit} onChange={clearIssue}>
      <fieldset disabled={pending} className="min-w-0 space-y-3">
        <legend className="sr-only">Private kickoff details</legend>
        <label className="block">
          <span className="eyebrow">Kickoff note</span>
          <textarea name="note" className="field mt-1" rows={3} minLength={KICKOFF_LIMITS.note.min} maxLength={KICKOFF_LIMITS.note.max * 2} required
            placeholder="What should the winner do first?" aria-describedby={`${id}-note-hint${issue?.fields?.note ? ` ${id}-error` : ""}`}
            aria-invalid={issue?.fields?.note ? true : undefined} />
          <span id={`${id}-note-hint`} className="mt-1 block text-[12px] text-ink-3">10–1,000 characters. Don’t include passwords, access codes, or payment details.</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <label className="block min-w-0">
            <span className="eyebrow">Proposed start date</span>
            <input name="startDate" type="date" min="0001-01-01" max="9999-12-31" className="field mt-1 min-w-0" required
              aria-invalid={issue?.fields?.startDate ? true : undefined} aria-describedby={issue?.fields?.startDate ? `${id}-error` : undefined} />
          </label>
          <label className="block min-w-0">
            <span className="eyebrow">Contact to share</span>
            <input name="contact" className="field mt-1" minLength={KICKOFF_LIMITS.contact.min} maxLength={KICKOFF_LIMITS.contact.max * 2} required
              placeholder="Email, phone, or handle" aria-describedby={`${id}-contact-hint${issue?.fields?.contact ? ` ${id}-error` : ""}`}
              aria-invalid={issue?.fields?.contact ? true : undefined} />
            <span id={`${id}-contact-hint`} className="mt-1 block text-[12px] text-ink-3">Only what you enter here is shared, never your sign-in email automatically.</span>
          </label>
        </div>
        {issue && <p id={`${id}-error`} role="alert" className="text-[13px] text-danger">{issue.message}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="submit" className="btn btn-primary">{pending ? "Sending…" : "Send kickoff details"}</button>
          <p className="text-[12px] text-ink-3">Check the details first. You can send them once.</p>
        </div>
      </fieldset>
    </form>
  );
}

export function KickoffAcknowledge({ leadId }: { leadId: number }) {
  const { pending, saved, issue, write } = useKickoffWrite(leadId);
  return (
    <div className="mt-3 space-y-2">
      {saved ? <p role="status" className="text-[13px]">Kickoff acknowledged.</p> : (
        <>
          <p className="text-[12px] text-ink-3">This confirms you received the details, not that work has started or been completed.</p>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void write("PATCH", { action: "acknowledge" })}>
            {pending ? "Acknowledging…" : "Acknowledge details"}
          </button>
        </>
      )}
      {issue && <p role="alert" className="text-[13px] text-danger">{issue.message}</p>}
    </div>
  );
}

export function KickoffRefresh() {
  const router = useRouter();
  const [pending, refresh] = useTransition();
  return <button type="button" disabled={pending} className="btn btn-ghost btn-sm mt-2 -ml-2" onClick={() => refresh(() => router.refresh())}>
    {pending ? "Refreshing…" : "Refresh kickoff status"}
  </button>;
}
