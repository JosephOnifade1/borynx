import { describe, expect, it } from "vitest";
import { assistedDueDate, formatServiceFee, parseServiceAction, parseServiceRequest } from "../lead-service-input";
import { leadServicePrice } from "../lead-service-policy";

describe("manual buyer services", () => {
  it("opts in separately and configures whole-naira prices on the server", () => {
    expect(leadServicePrice("assisted_hire", {})).toBeNull();
    expect(leadServicePrice("assisted_hire", { BORYNX_ASSISTED_HIRE: "1" })).toBe(2_500_000);
    expect(formatServiceFee(2_500_000)).toBe("₦25,000");
    expect(leadServicePrice("sponsored_lead", { BORYNX_SPONSORED_LEAD_PRICE_NGN: "5000" })).toBeNull();
    for (const price of [undefined, "0", "-10", "10.10", "10000000", "5e3", "5000 "]) {
      expect(leadServicePrice("sponsored_lead", { BORYNX_SPONSORED_LEADS: "1", BORYNX_SPONSORED_LEAD_PRICE_NGN: price })).toBeNull();
    }
    expect(leadServicePrice("sponsored_lead", { BORYNX_SPONSORED_LEADS: "1", BORYNX_SPONSORED_LEAD_PRICE_NGN: "5000" })).toBe(500_000);
  });

  it("requires contact consent and rejects forged price, contact, or payment data", () => {
    expect(parseServiceRequest({ kind: "assisted_hire", contactConsent: true })).toBe("assisted_hire");
    for (const input of [null, [], { kind: "__proto__", contactConsent: true }, { kind: "sponsored_lead" },
      { kind: "assisted_hire", contactConsent: true, amountMinor: 1 }, { kind: "sponsored_lead", contactConsent: true, email: "other@example.test" }]) {
      expect(() => parseServiceRequest(input)).toThrow(expect.objectContaining({ code: "invalid_service" }));
    }
    expect(parseServiceAction({ action: "record_refund" })).toBe("record_refund");
    expect(() => parseServiceAction({ action: "confirm_payment", amount: 1 })).toThrow(expect.objectContaining({ code: "invalid_service_action" }));
    expect(() => parseServiceAction({ action: "__proto__" })).toThrow(expect.objectContaining({ code: "invalid_service_action" }));
  });

  it("calculates a two-weekday deadline on the Lagos calendar", () => {
    expect(assistedDueDate(new Date("2026-11-19T22:00:00Z"))).toBe("2026-11-23"); // Thursday
    expect(assistedDueDate(new Date("2026-11-19T23:30:00Z"))).toBe("2026-11-24"); // Friday in Lagos
    expect(assistedDueDate(new Date("2026-11-21T08:00:00Z"))).toBe("2026-11-24"); // Saturday
  });
});
