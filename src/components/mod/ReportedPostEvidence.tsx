/** Only used inside the authorized moderation queues. React escapes the original Markdown. */
export function ReportedPostEvidence({ snapshot }: { snapshot: { title: string; body: string } | null }) {
  if (!snapshot) return null;
  return (
    <details className="mt-2 rounded-md border border-line bg-sunken/40 px-3 py-2 text-[12.5px]">
      <summary className="cursor-pointer font-medium">Reported version</summary>
      <p className="mt-2 font-semibold">{snapshot.title}</p>
      <div className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words text-ink-2">{snapshot.body}</div>
    </details>
  );
}
