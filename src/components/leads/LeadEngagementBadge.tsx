import { ENGAGEMENT_LABELS, type LeadEngagementLabel } from "@/lib/lead-engagement";

export function LeadEngagementBadge({ engagement }: { engagement: LeadEngagementLabel }) {
  const { label, tone } = ENGAGEMENT_LABELS[engagement];
  return <span className={`tag ${tone}`}>{label}</span>;
}
