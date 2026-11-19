import { describe, expect, it } from "vitest";
import { findLeadReviewSignals, RAPID_COMPLETION_HOURS, type AwardForSignals } from "../lead-review-signals";

const awardTime = 1_790_000_000_000;
const award = (leadId: number, overrides: Partial<AwardForSignals> = {}): AwardForSignals => ({
  leadId, buyerId: 1, winnerId: 2, buyer: "buyer", winner: "winner", awardedAt: new Date(awardTime), completedAt: null, review: null, ...overrides,
});

describe("advisory engagement signals", () => {
  it("uses actual award and completion dates, without guessing at missing or inconsistent evidence", () => {
    const exact = RAPID_COMPLETION_HOURS * 3_600_000;
    const results = findLeadReviewSignals([
      award(7, { completedAt: new Date(awardTime + exact) }),
      award(6, { completedAt: new Date(awardTime + exact + 1) }),
      award(5, { completedAt: new Date(awardTime - 1) }),
      award(4, { awardedAt: null, completedAt: new Date(awardTime) }),
      award(3),
    ]);
    expect(results).toEqual([{ leadId: 7, buyer: "buyer", winner: "winner", reviewId: null, signals: [{ kind: "rapid_completion" }] }]);
  });

  it("finds awards in both directions once, not repeat hiring in the same direction", () => {
    const results = findLeadReviewSignals([
      award(4, { buyerId: 2, winnerId: 1, buyer: "winner", winner: "buyer" }), award(3), award(2),
    ]);
    expect(results).toEqual([{
      leadId: 4, buyer: "winner", winner: "buyer", reviewId: null, signals: [{ kind: "reciprocal_award", relatedLeadId: 3 }],
    }]);
  });

  it("finds similar long testimonials for shared accounts and returns IDs rather than text", () => {
    const original = "They documented the full checkout flow and shared a prioritized accessibility report with clear steps to verify each fix.";
    const changed = original.toUpperCase().replace("FULL CHECKOUT", "whole—checkout").replaceAll(" ", "  ");
    const results = findLeadReviewSignals([
      award(5, { buyerId: 10, winnerId: 11, review: { id: 105, testimonial: original } }),
      award(4, { review: { id: 104, testimonial: changed } }),
      award(3, { buyerId: 8, review: { id: 103, testimonial: original } }),
      award(2, { review: { id: 102, testimonial: "Great, a very nice job." } }),
      award(1, { review: { id: 101, testimonial: "Great, a very nice job." } }),
    ]);
    expect(results).toEqual([{
      leadId: 4, buyer: "buyer", winner: "winner", reviewId: 104, signals: [{ kind: "similar_testimonial", relatedLeadId: 3, relatedReviewId: 103 }],
    }]);
  });

  it("caps the suggestions in newest-first order", () => {
    const results = findLeadReviewSignals(Array.from({ length: 25 }, (_, i) => award(25 - i, { completedAt: new Date(awardTime + 1) })));
    expect(results.map((row) => row.leadId)).toEqual(Array.from({ length: 20 }, (_, i) => 25 - i));
  });
});
