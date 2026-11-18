import type { Lead, ReportReason } from "@/db/schema";

export const LEAD_CATEGORIES = ["Software Engineering", "Web & Mobile", "DevOps & Cloud", "UI/UX Design", "Cybersecurity", "Data Science", "AI/ML", "Product", "Consulting", "Other"] as const;
export type LeadCategory = (typeof LEAD_CATEGORIES)[number];

export const REPORT_REASONS: ReadonlyArray<{ id: Exclude<ReportReason, "automated_filter">; label: string; hint: string }> = [
  { id: "spam_scam", label: "Spam / Scam", hint: "Unsolicited promotion, phishing, or fraudulent offers" },
  { id: "off_topic", label: "Off-topic / Low quality", hint: "Doesn't belong in this space or adds nothing" },
  { id: "unverified_lead", label: "Unverified lead", hint: "Claims a client or budget that can't be substantiated" },
  { id: "harassment", label: "Harassment", hint: "Targets a person rather than an argument" },
  { id: "misleading_bounty", label: "Misleading bounty", hint: "Scope, payout, or terms are deceptive" },
];

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  spam_scam: "Spam / Scam",
  off_topic: "Off-topic",
  unverified_lead: "Unverified lead",
  harassment: "Harassment",
  misleading_bounty: "Misleading bounty",
  automated_filter: "Auto-filter",
};

export const POST_KIND_LABEL = {
  discussion: "Discussion",
  resource: "Resource",
  help: "Help wanted",
  showcase: "Showcase",
} as const;

export const LEAD_KIND_LABEL = {
  bounty: "Bounty",
  contract: "Contract",
  job: "Role",
} as const;

export function leadBudgetUnitLabel(unit: Lead["budgetUnit"]): string {
  return unit === "hourly" ? "Hourly rate" : unit === "fixed" ? "Fixed amount" : "Budget unit not recorded";
}

/** Shown in the right context rail on every feed page. */
export const PLATFORM_RULES: ReadonlyArray<string> = [
  "Post to the community that matches the work. Cross-posting is fine when it helps.",
  "Show the code, the numbers, or the failure mode — not just the conclusion.",
  "Leads need a scope, a budget, and a way to evaluate bids.",
  "No upfront deposits, off-platform payment requests, or guaranteed-income claims.",
  "Mark the comment that solved it. Solvers earn 10× karma.",
];
