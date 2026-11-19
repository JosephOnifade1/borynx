import { describe, expect, it } from "vitest";
import { assertKickoffAcknowledgement, parseKickoffInput } from "../lead-kickoff-input";

const valid = { note: "Review the checklist first, then send me a proposed schedule.", contact: "hello@example.test", startDate: "2028-02-29" };

describe("private kickoff inputs", () => {
  it("trims plain text and preserves a valid calendar day", () => {
    expect(parseKickoffInput({ ...valid, note: `  ${valid.note}\r\n<em>Thank you</em>  `, contact: ` ${valid.contact} ` })).toEqual({
      ...valid, note: `${valid.note}\n<em>Thank you</em>`,
    });
  });

  it.each(["2027-02-29", "2028-02-30", "0000-01-01", "2028-04-31", "2028-2-09", "2028-01-01T00:00:00Z", null, 20280101])("rejects invalid proposed dates (%j)", (startDate) => {
    expect(() => parseKickoffInput({ ...valid, startDate })).toThrow(expect.objectContaining({ status: 422, fields: { startDate: expect.any(String) } }));
  });

  it("enforces inclusive Unicode bounds", () => {
    expect(parseKickoffInput({ ...valid, note: "🎉".repeat(1_000), contact: "🐝".repeat(200) })).toMatchObject({ note: "🎉".repeat(1_000), contact: "🐝".repeat(200) });
    for (const note of ["🎉".repeat(9), "🎉".repeat(1_001), "   short   ", `Note with unsupported null byte \0.`, `Note with invalid surrogate \ud800.`]) {
      expect(() => parseKickoffInput({ ...valid, note })).toThrow(expect.objectContaining({ status: 422, fields: { note: expect.any(String) } }));
    }
    for (const contact of [undefined, "xx", "x".repeat(201), "first method\nsecond method", "handle\tsecond", "first\u2028second"]) {
      expect(() => parseKickoffInput({ ...valid, contact })).toThrow(expect.objectContaining({ status: 422, fields: { contact: expect.any(String) } }));
    }
  });

  it.each(["winnerId", "buyerId", "leadId", "bidId", "acknowledgedAt"])("rejects caller-supplied %s", (field) => {
    expect(() => parseKickoffInput({ ...valid, [field]: 1 })).toThrow(expect.objectContaining({ status: 422, code: "invalid_kickoff" }));
  });

  it("requires object bodies and one explicit acknowledgement action", () => {
    for (const invalid of [null, [], "text"]) expect(() => parseKickoffInput(invalid)).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => assertKickoffAcknowledgement({ action: "acknowledge" })).not.toThrow();
    for (const invalid of [{}, { action: "start" }, { action: "acknowledge", winnerId: 1 }]) {
      expect(() => assertKickoffAcknowledgement(invalid)).toThrow(expect.objectContaining({ status: 422 }));
    }
  });
});
