import { describe, expect, it } from "vitest";
import { parseReviewCursor, parseReviewDecision, parseReviewId, parseReviewInput } from "../lead-review-input";

const testimonial = "They delivered a clear report in time.";

describe("engagement review inputs", () => {
  it.each([undefined, null, 0, 6, 1.5, "5", NaN, true, [5]])("rejects a non-star rating %j", (rating) => {
    expect(() => parseReviewInput({ rating, testimonial })).toThrow(expect.objectContaining({ status: 422, fields: { rating: expect.any(String) } }));
  });

  it.each(["  too short ", "a".repeat(2001), "✅".repeat(19), `This contains a null character \0 in the middle.`, `Unsupported surrogate \ud800 in a testimonial.`, 20, null])("validates the trimmed testimonial %j", (value) => {
    expect(() => parseReviewInput({ rating: 5, testimonial: value })).toThrow(expect.objectContaining({ status: 422, fields: { testimonial: expect.any(String) } }));
  });

  it("trims plain text and accepts the inclusive Unicode bounds", () => {
    expect(parseReviewInput({ rating: 1, testimonial: ` \n ${testimonial}\n<em>plain text</em>\n` })).toEqual({ rating: 1, testimonial: `${testimonial}\n<em>plain text</em>` });
    expect(parseReviewInput({ rating: 5, testimonial: `  ${"🎉".repeat(20)} ` }).testimonial).toBe("🎉".repeat(20));
    expect(parseReviewInput({ rating: 5, testimonial: `  ${"🎉".repeat(2_000)} ` }).testimonial).toBe("🎉".repeat(2_000));
  });

  it.each(["leadId", "reviewerId", "recipientId", "visibility"])("does not accept caller-supplied %s", (field) => {
    expect(() => parseReviewInput({ rating: 4, testimonial, [field]: 7 })).toThrow(expect.objectContaining({ status: 422 }));
  });

  it("requires objects, valid actions, and a bounded, nonblank decision reason", () => {
    for (const body of [null, [], "hello"]) expect(() => parseReviewInput(body)).toThrow(expect.objectContaining({ status: 400 }));
    for (const action of ["publish", "hide", "restore"]) {
      expect(parseReviewDecision({ action, reason: " Checked the evidence. " })).toEqual({ action, reason: "Checked the evidence." });
    }
    for (const body of [{ action: "approve", reason: "ok" }, { action: "hide", reason: "  " }, { action: "hide", reason: "r".repeat(501) }]) {
      expect(() => parseReviewDecision(body)).toThrow(expect.objectContaining({ status: 422 }));
    }
  });

  it("seeks using all timestamp digits and an in-range integer ID", () => {
    const time = "2024-02-29T12:00:00.000017Z";
    expect(parseReviewCursor(undefined)).toBeUndefined();
    expect(parseReviewCursor(`${time}:2147483647`)).toEqual({ time, id: 2_147_483_647 });
    expect(parseReviewId("2147483647")).toBe(2_147_483_647);
    for (const cursor of ["", "3", `${time}:-1`, `${time}:2147483648`, "2025-02-29T12:00:00.000017Z:1", "2025-01-01T24:00:00.000000Z:1", [`${time}:1`, `${time}:2`]]) {
      expect(() => parseReviewCursor(cursor)).toThrow(expect.objectContaining({ status: 400, code: "invalid_cursor" }));
    }
    for (const id of [undefined, "5junk", "0", "1.25", "2147483648"]) expect(() => parseReviewId(id)).toThrow(expect.objectContaining({ status: 400 }));
  });
});
