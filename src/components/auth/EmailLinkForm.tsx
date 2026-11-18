"use client";

import { useMutation } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useHydrated } from "@/lib/browser";
import { api, ClientError } from "@/lib/client";
import type { LeadInput } from "@/lib/lead-input";

type Props = { mode: "login"; destination: string } | {
  mode: "intake";
  lead: LeadInput;
  onAttempt: () => void;
  onBack: () => void;
};

export function EmailLinkForm(props: Props) {
  const hydrated = useHydrated();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [sent, setSent] = useState(false);
  const prefix = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (sent || props.mode === "intake") heading.current?.focus();
  }, [sent, props.mode]);
  const request = useMutation({
    mutationFn: () => props.mode === "intake"
      ? api<{ status: "check_email" }>("/api/leads/intake", { method: "POST", json: { lead: props.lead, email, displayName, companyName } })
      : api<{ status: "check_email" }>("/api/auth/email", { method: "POST", json: { email, next: props.destination } }),
    onSuccess: () => setSent(true),
  });
  const errorFor = (name: string) => request.error instanceof ClientError ? request.error.fields?.[name] : undefined;
  const fieldProps = (name: string) => ({
    "aria-invalid": Boolean(errorFor(name)) || undefined,
    "aria-describedby": errorFor(name) ? `${prefix}-${name}` : undefined,
  });
  const note = (name: string) => errorFor(name) && <span id={`${prefix}-${name}`} className="block pt-1 text-[12px] text-danger">{errorFor(name)}</span>;
  const seconds = request.error instanceof ClientError ? request.error.retryAfter : undefined;
  const wait = seconds && (seconds > 60 ? `${Math.ceil(seconds / 60)} min` : `${seconds} sec`);

  return (
    <form method="post" className="px-4 py-5 sm:px-7 sm:py-6" aria-label={props.mode === "intake" ? "Lead contact details" : "Email sign-in"} onSubmit={(event) => {
      event.preventDefault();
      if (!hydrated || request.isPending) return;
      if (props.mode === "intake") props.onAttempt();
      request.mutate();
    }}>
      <fieldset className="min-w-0 space-y-4" disabled={!hydrated || request.isPending}>
        <legend className="sr-only">{props.mode === "intake" ? "Contact details" : "Email address"}</legend>
        <div>
          <p className="eyebrow text-ember flex items-center gap-1.5"><Mail size={14} aria-hidden="true" /> {props.mode === "intake" ? "Private draft · step 2 of 2" : "Email access"}</p>
          <h2 className="display mt-1 text-[21px]" ref={heading} tabIndex={-1}>{sent ? "Check your email" : props.mode === "intake" ? "Confirm your email first" : "Get a sign-in link"}</h2>
          {sent ? (
            <div role="status" className="mt-2 space-y-2 text-[13px] text-ink-2">
              <p>If delivery is available, a sign-in link is on its way. Open the latest link in this same browser profile, not in an embedded mail preview. The link expires after 15 minutes.</p>
              {props.mode === "intake" && <p>Your brief is private for up to 24 hours. The link brings you back to review it; you still need to press <strong>Submit for review</strong>.</p>}
              <p>Nothing in your inbox? Check spam, then wait at least a minute before requesting a new link.</p>
            </div>
          ) : props.mode === "intake" ? (
            <p className="mt-2 text-[13px] text-ink-2">We&apos;ll save this brief privately for 24 hours and send a link to this address. Nothing goes to reviewers until you confirm the submission. On a new account, your name is public; email and company are not.</p>
          ) : <p className="mt-2 text-[13px] text-ink-2">Use your inbox to sign in or create a Borynx account. Open the link in the same browser you use here.</p>}
        </div>
        {request.error && <p role="alert" className="rounded-md border border-danger/40 bg-danger-soft/30 px-3 py-2 text-[13px] text-danger">{request.error.message}{wait && ` Try again in ${wait}.`}</p>}
        {!sent && (
          <div className="space-y-3">
            <label className="block"><span className="eyebrow">Email</span>
              <input {...fieldProps("email")} type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} className="field mt-1.5" />
              {note("email")}
            </label>
            {props.mode === "intake" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="eyebrow">Your name</span>
                  <input {...fieldProps("displayName")} autoComplete="name" minLength={2} maxLength={80} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="field mt-1.5" />
                  {note("displayName")}
                </label>
                <label className="block"><span className="eyebrow">Company (optional)</span>
                  <input {...fieldProps("companyName")} autoComplete="organization" maxLength={100} value={companyName} onChange={(event) => setCompanyName(event.target.value)} className="field mt-1.5" />
                  {note("companyName")}
                </label>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          {props.mode === "intake" ? <button type="button" className="btn" onClick={props.onBack}>Back to brief</button> : sent && (
            <button type="button" className="btn" onClick={() => { setSent(false); request.reset(); }}>Change email</button>
          )}
          <button type="submit" className="btn btn-primary">{request.isPending ? "Requesting link…" : sent ? "Resend link" : "Email me a link"}</button>
        </div>
      </fieldset>
    </form>
  );
}
