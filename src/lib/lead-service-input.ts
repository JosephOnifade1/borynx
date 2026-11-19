import { HttpError } from "./errors";

export const LEAD_SERVICE_LABEL = { assisted_hire: "Assisted Hire", sponsored_lead: "Sponsored lead" } as const;
export type LeadServiceKind = keyof typeof LEAD_SERVICE_LABEL;
export type LeadServiceState = "requested" | "confirmed" | "delivered" | "declined" | "refunded";

export const LEAD_SERVICE_ACTION_LABEL = {
  confirm_payment: "Confirm received payment",
  deliver: "Mark shortlist delivered",
  decline: "Decline request",
  record_refund: "Record completed refund",
} as const;
export type LeadServiceAction = keyof typeof LEAD_SERVICE_ACTION_LABEL;
export const SPONSOR_DAYS = 7;

function object(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(422, "Expected a service request.", "invalid_service");
  return body as Record<string, unknown>;
}

export function parseServiceRequest(input: unknown): LeadServiceKind {
  const body = object(input);
  if (Object.keys(body).some((key) => key !== "kind" && key !== "contactConsent") ||
    typeof body.kind !== "string" || !Object.hasOwn(LEAD_SERVICE_LABEL, body.kind) || body.contactConsent !== true) {
    throw new HttpError(422, "Choose a service and consent to being contacted at your confirmed email.", "invalid_service");
  }
  return body.kind as LeadServiceKind;
}

export function parseServiceAction(input: unknown): LeadServiceAction {
  const body = object(input);
  if (Object.keys(body).length !== 1 || typeof body.action !== "string" || !Object.hasOwn(LEAD_SERVICE_ACTION_LABEL, body.action)) {
    throw new HttpError(422, "Choose a valid service action.", "invalid_service_action");
  }
  return body.action as LeadServiceAction;
}

/** Two weekdays after payment confirmation, using Lagos calendar dates (UTC+1). */
export function assistedDueDate(confirmedAt: Date): string {
  const day = new Date(confirmedAt.getTime() + 3_600_000);
  for (let weekdays = 0; weekdays < 2;) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) weekdays++;
  }
  return day.toISOString().slice(0, 10);
}

export function formatServiceFee(amountMinor: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 })
    .format(amountMinor / 100);
}

export function serviceStateLabel(kind: LeadServiceKind, state: LeadServiceState, endsAt: Date | null) {
  switch (state) {
    case "requested": return "Requested · no payment taken";
    case "confirmed": return kind === "assisted_hire" ? "Payment recorded · shortlisting" : endsAt && endsAt <= new Date() ? "Placement window ended" : "Payment recorded · slot reserved";
    case "delivered": return "Shortlist delivered";
    case "declined": return "Request declined";
    case "refunded": return "Refund recorded";
  }
}
