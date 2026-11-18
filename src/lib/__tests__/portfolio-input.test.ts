import { describe, expect, it } from "vitest";
import { parseCoverAlt, parseProjectCreate, parseProjectDecision, parseProjectId, parseProjectOrder, parseProjectPatch, PROJECT_LIMITS } from "../portfolio-input";

const valid = { title: " Accessible checkout ", description: " Rebuilt checkout flow with keyboard tests.\r\nShipped with the design team. ", techTags: [" React ", "NODE.JS", "react", "C++", "Web  accessibility"] };

function invalid(run: () => unknown, field: string) {
  expect(run).toThrow(expect.objectContaining({ status: 422, fields: { [field]: expect.any(String) } }));
}

describe("portfolio inputs", () => {
  it("normalizes draft text and technology tags without requiring links", () => {
    expect(parseProjectCreate(valid)).toEqual({ title: "Accessible checkout", description: "Rebuilt checkout flow with keyboard tests.\nShipped with the design team.",
      roleOutcome: null, liveUrl: null, repoUrl: null, techTags: ["react", "node.js", "c++", "web accessibility"] });
    expect(parseProjectCreate({ ...valid, liveUrl: " https://Example.test/case-study ", roleOutcome: " Lead engineer " })).toMatchObject({
      liveUrl: "https://example.test/case-study", roleOutcome: "Lead engineer", repoUrl: null,
    });
  });

  it.each([{ value: null }, { value: [] }, { value: "project" }])("rejects a non-object request: $value", ({ value }) => {
    expect(() => parseProjectCreate(value)).toThrow(expect.objectContaining({ status: 400 }));
  });

  it("bounds required fields, optional text, and unique normalized tags", () => {
    for (const [key, value] of [
      ["title", "Hi"], ["title", "A".repeat(121)], ["title", "bad\nname"],
      ["description", "Short"], ["description", "A".repeat(2001)], ["description", "Null character in description: \0"],
      ["roleOutcome", "r".repeat(501)], ["roleOutcome", 42], ["roleOutcome", "Bad\udbff"],
      ["techTags", []], ["techTags", Array(9).fill("tag")], ["techTags", ["t".repeat(25)]], ["techTags", ["<span>"]],
      ["techTags", [true]], ["techTags", ["--"]],
    ] as const) invalid(() => parseProjectCreate({ ...valid, [key]: value }), key);
  });

  it.each(["http://example.test", "https:example.test", "https://test:password@example.test/", "//example.test", "mailto:a@example.test", "https://example.test/a b", "https://"])("requires credential-free HTTPS project links: %s", (liveUrl) => {
    invalid(() => parseProjectPatch({ liveUrl }), "liveUrl");
    invalid(() => parseProjectCreate({ ...valid, repoUrl: liveUrl }), "repoUrl");
  });

  it("allows partial editing and explicit clears without granting write access to server fields", () => {
    expect(parseProjectPatch({})).toEqual({});
    expect(parseProjectPatch({ isPublished: true, liveUrl: null, repoUrl: null, roleOutcome: null })).toEqual({ isPublished: true, liveUrl: null, repoUrl: null, roleOutcome: null });
    for (const field of ["id", "userId", "ownerId", "hiddenAt", "hidden", "position", "coverUrl", "coverKey", "coverAlt", "bytes", "createdAt", "role"]) {
      invalid(() => parseProjectPatch({ [field]: true }), field);
    }
    invalid(() => parseProjectPatch({ isPublished: "true" }), "isPublished");
    invalid(() => parseProjectCreate({ ...valid, isPublished: true }), "isPublished");
  });

  it("validates numeric IDs and lets only the reorder endpoint submit a full ID list", () => {
    expect(parseProjectId("2147483647")).toBe(2_147_483_647);
    for (const raw of [undefined, "", "0", "-1", "10.5", "1a", "2147483648"]) expect(() => parseProjectId(raw)).toThrow(expect.objectContaining({ status: 404 }));
    expect(parseProjectOrder({ ids: [] })).toEqual([]);
    expect(parseProjectOrder({ ids: [3, 5, 2] })).toEqual([3, 5, 2]);
    for (const ids of [[2, 2], ["2"], [1.1], [0], [1, 2, 3, 4, 5, 6, 7], null]) invalid(() => parseProjectOrder({ ids }), "ids");
  });

  it("bounds cover descriptions and requires a reason for every moderation decision", () => {
    expect(parseCoverAlt(null)).toBe("");
    expect(parseCoverAlt(" Screenshot of the checkout ")).toBe("Screenshot of the checkout");
    invalid(() => parseCoverAlt("x".repeat(PROJECT_LIMITS.altText + 1)), "altText");
    invalid(() => parseCoverAlt(42), "altText");
    expect(parseProjectDecision({ action: "restore", reason: "  Reviewed disclosure.  " })).toEqual({ action: "restore", reason: "Reviewed disclosure." });
    invalid(() => parseProjectDecision({ action: "hide", reason: "\n " }), "reason");
    invalid(() => parseProjectDecision({ action: "delete", reason: "Invalid action" }), "action");
  });
});
