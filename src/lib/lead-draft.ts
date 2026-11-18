"use client";

import { safeStorage } from "./browser";

export const LEAD_DRAFT_KEY = "bx-lead-draft-v1";

/** Don't discard a different brief the user started while waiting for their link. */
export function clearMatchingLeadDraft(submissionKey: string) {
  const raw = safeStorage.get(LEAD_DRAFT_KEY, "session");
  try {
    if (raw && JSON.parse(raw)?.key === submissionKey) safeStorage.remove(LEAD_DRAFT_KEY, "session");
  } catch { /* An invalid local draft is not this submission. */ }
}
