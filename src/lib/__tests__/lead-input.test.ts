import { describe, expect, it } from "vitest";
import { HttpError } from "../errors";
import { CONTRACT_FLOORS, MAX_LEAD_BUDGET, parseLeadFields, parseLeadRevision, parseSubmissionKey } from "../lead-input";

const now = Date.parse("2026-11-17T12:00:00Z");
const valid = {
  title: "Review a customer onboarding flow",
  description: "Produce a short accessibility audit of three onboarding screens and deliver a prioritized list of fixes.",
  category: "Web & Mobile", kind: "contract", budgetMin: 50, budgetMax: 200,
  deliveryTimeline: "  Two weeks from kickoff  ",
  currency: "USD", budgetUnit: "fixed", skillTags: ["react", "accessibility"],
};
const parse = (fields: Record<string, unknown>) => parseLeadFields({ ...valid, ...fields }, { now });

function invalid(fields: Record<string, unknown>, field: string) {
  try {
    parse(fields);
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 422, code: "invalid_lead", fields: { [field]: expect.any(String) } });
    return;
  }
  throw new Error(`Expected a validation error for ${field}`);
}

describe("new lead validation", () => {
  it("normalizes a brief without inferring any budget unit", () => {
    expect(parse({ title: ` ${valid.title} `, skillTags: [" React ", "react", " PostgreSQL "], location: " ", deadlineAt: "2027-01-10T15:00:00+01:00" })).toMatchObject({
      title: valid.title, skillTags: ["react", "postgresql"], deadlineAt: "2027-01-10T14:00:00.000Z", location: "Remote", spaceSlug: null, budgetUnit: "fixed",
    });
    invalid({ budgetUnit: undefined }, "budgetUnit");
    expect(parse({}).deliveryTimeline).toBe("Two weeks from kickoff");
    for (const deliveryTimeline of [undefined, " ", "Day one\nDay two", "A".repeat(161)]) invalid({ deliveryTimeline }, "deliveryTimeline");
    invalid({ kind: "bounty", budgetMin: 0, budgetMax: 0 }, "budgetMax");
  });

  it.each(Object.entries(CONTRACT_FLOORS))("enforces %s floors for new contracts only", (currency, floors) => {
    for (const [budgetUnit, floor] of Object.entries(floors)) {
      expect(parse({ currency, budgetUnit, budgetMin: floor, budgetMax: floor }).budgetMin).toBe(floor);
      invalid({ currency, budgetUnit, budgetMin: floor - 1, budgetMax: floor + 10 }, "budgetMin");
      for (const kind of ["job", "bounty"]) expect(parse({ currency, budgetUnit, kind, budgetMin: 0, budgetMax: 10 }).budgetMin).toBe(0);
      expect(parseLeadFields({ ...valid, currency, budgetUnit, budgetMin: 1, budgetMax: 10 }, { now, enforceFloor: false }).budgetMin).toBe(1);
    }
  });

  it.each([
    [{ title: " Too short " }, "title"], [{ description: "   " }, "description"], [{ category: "Software" }, "category"],
    [{ kind: "gig" }, "kind"], [{ currency: "CAD" }, "currency"], [{ budgetMin: "50" }, "budgetMin"],
    [{ budgetMin: -1 }, "budgetMin"], [{ budgetMax: 200.5 }, "budgetMax"], [{ budgetMax: MAX_LEAD_BUDGET + 1 }, "budgetMax"],
    [{ budgetMax: 49 }, "budgetMax"], [{ title: "Title contains a \0 byte" }, "title"], [{ skillTags: [] }, "skillTags"], [{ skillTags: ["constructor"] }, "skillTags"],
    [{ skillTags: ["react", "typescript", "java", "swift", "kotlin", "go", "rust"] }, "skillTags"],
    [{ deadlineAt: "2026-11-16T10:00Z" }, "deadlineAt"], [{ deadlineAt: "2027-02-30T00:00Z" }, "deadlineAt"],
    [{ deadlineAt: "2027-02-20T14:00" }, "deadlineAt"], [{ location: 42 }, "location"],
  ] as const)("rejects invalid fields %#", (fields, field) => invalid({ ...fields }, field));

  it("requires a UUID and integer revision", () => {
    expect(parseSubmissionKey("682A1432-814D-4FC7-B238-8B7BD16FA5CD")).toBe("682a1432-814d-4fc7-b238-8b7bd16fa5cd");
    expect(() => parseSubmissionKey("other-actor")).toThrow(HttpError);
    expect(parseLeadRevision(1)).toBe(1);
    expect(() => parseLeadRevision("1")).toThrow(HttpError);
  });
});
