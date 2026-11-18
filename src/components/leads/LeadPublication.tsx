import type { Lead } from "@/db/schema";

type State = Lead["publicationStatus"];

const LABELS: Record<State, { label: string; tone: string }> = {
  pending_review: { label: "Pending review", tone: "tag-gold" },
  changes_requested: { label: "Changes requested", tone: "tag-gold" },
  published: { label: "Published", tone: "tag-success" },
  rejected: { label: "Not approved", tone: "tag-danger" },
};

export function LeadPublicationBadge({ state, closed = false, legacy = false, removed = false }: {
  state: State; closed?: boolean; legacy?: boolean; removed?: boolean;
}) {
  const { label, tone } = LABELS[state];
  const closedSubmission = closed && state !== "published";
  const text = removed ? "Removed" : closedSubmission ? (legacy ? "Closed" : "Withdrawn") : label;
  return <span className={`tag ${removed || closedSubmission ? "tag-danger" : tone}`}>{text}</span>;
}
