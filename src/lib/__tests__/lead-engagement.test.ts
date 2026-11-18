import { describe, expect, it } from "vitest";
import { canSelectBid, getLeadEngagement, matchesLeadAward, MAX_BID_AMOUNT, parseBidInput, parseLeadAction } from "../lead-engagement";

const pitch = "Deliver a documented audit of the keyboard navigation.";
const unawarded = { id: 10, authorId: 20, status: "open" as const, acceptedBidId: null, assignedUserId: null, awardNeedsReview: false, deadlineAt: null };

describe("pitch validation", () => {
  it("trims text and accepts whole amounts without coercion", () => {
    expect(parseBidInput({ amount: 125, message: `  ${pitch}  ` })).toEqual({ amount: 125, message: pitch });
    expect(parseBidInput({ amount: MAX_BID_AMOUNT, message: pitch }).amount).toBe(MAX_BID_AMOUNT);
  });
  it.each([undefined, null, 0, -5, 1.5, "125", Infinity, MAX_BID_AMOUNT + 1])("rejects quote %s", (amount) => {
    expect(() => parseBidInput({ amount, message: pitch })).toThrow(expect.objectContaining({ status: 422, fields: { amount: expect.any(String) } }));
  });
  it.each(["  Need info  ", "a".repeat(4_001), `${pitch}\0`])("rejects invalid pitch %#", (message) => {
    expect(() => parseBidInput({ amount: 125, message })).toThrow(expect.objectContaining({ status: 422, fields: { message: expect.any(String) } }));
  });
});

describe("lead engagement", () => {
  it("does not confuse an expired deadline with closing or awarding a lead", () => {
    const elapsed = { ...unawarded, deadlineAt: new Date(1000) };
    expect(getLeadEngagement(elapsed, 999)).toBe("open");
    expect(getLeadEngagement(elapsed, 1000)).toBe("deadline_passed");
    expect(canSelectBid(elapsed)).toBe(true);
    expect(canSelectBid({ ...unawarded, status: "in_review" })).toBe(true);
    expect(canSelectBid({ ...unawarded, status: "closed" })).toBe(false);
    expect(canSelectBid({ ...unawarded, acceptedBidId: 4 })).toBe(false);
    expect(getLeadEngagement({ ...unawarded, awardNeedsReview: true })).toBe("unavailable");
  });

  it("checks the canonical pointer, bidder, lead, and acceptance marker", () => {
    const lead = { ...unawarded, status: "awarded" as const, acceptedBidId: 35, assignedUserId: 23 };
    const winning = { id: 35, leadId: 10, userId: 23, isAccepted: true };
    expect(matchesLeadAward(lead, winning)).toBe(true);
    expect(matchesLeadAward(lead, { ...winning, leadId: 100 })).toBe(false);
    expect(matchesLeadAward(lead, { ...winning, userId: 44 })).toBe(false);
    expect(matchesLeadAward(lead, { ...winning, isAccepted: false })).toBe(false);
    expect(matchesLeadAward({ ...lead, awardNeedsReview: true }, winning)).toBe(false);
  });

  it("does not accept free-form status updates or reopening", () => {
    expect(parseLeadAction({ action: "complete" })).toBe("complete");
    expect(parseLeadAction({ action: "withdraw" })).toBe("withdraw");
    expect(() => parseLeadAction({ status: "closed" })).toThrow();
    expect(() => parseLeadAction({ action: "reopen" })).toThrow();
  });
});
