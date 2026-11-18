import { describe, expect, it } from "vitest";
import { companyWebsite, MAX_HOURLY_RATE, parseProfilePatch, toProfilePreferences } from "../profile-input";

type Rate = Parameters<typeof parseProfilePatch>[1];
const noRate: Rate = { hourlyRate: null, hourlyCurrency: null };
const usd: Rate = { hourlyRate: 80, hourlyCurrency: "USD" };

function invalid(value: unknown, field: string, current: Rate = noRate) {
  expect(() => parseProfilePatch(value, current)).toThrow(expect.objectContaining({
    status: 422,
    code: "invalid_profile",
    fields: { [field]: expect.any(String) },
  }));
}

describe("profile preferences", () => {
  it.each([
    [false, false], [true, false], [false, true], [true, true],
  ])("accepts independent intents: hire %s, work %s", (lookingToHire, availableForWork) => {
    expect(parseProfilePatch({ lookingToHire, availableForWork }, noRate)).toEqual({ lookingToHire, availableForWork });
  });

  it.each([null, [], "settings", 1].map((value) => ({ value })))("rejects a non-object body: $value", ({ value }) => {
    expect(() => parseProfilePatch(value, noRate)).toThrow(expect.objectContaining({ status: 400 }));
  });

  it("never changes account permissions, derived counts, or the company privacy marker directly", () => {
    for (const key of ["id", "role", "isVerified", "badges", "companyNamePublic", "isBanned", "publishedLeads", "currentlyHiring"]) {
      invalid({ [key]: true, availableForWork: true }, key);
    }
    invalid({ lookingToHire: "false" }, "lookingToHire");
    invalid({ availableForWork: 1 }, "availableForWork");
    invalid({ availableForWork: null }, "availableForWork");
  });

  it("keeps older editable profile fields and true partial updates", () => {
    expect(parseProfilePatch({ displayName: "  Alex Builder  ", headline: "", bio: "Line 1\nLine 2", skills: [" Rust "], avatarHue: 88,
      githubUrl: "github.com/alex", portfolioUrl: null }, usd)).toEqual({
      displayName: "Alex Builder", headline: "", bio: "Line 1\nLine 2", skills: ["Rust"], avatarHue: 88,
      githubUrl: "https://github.com/alex", portfolioUrl: null,
    });
    expect(parseProfilePatch({}, usd)).toEqual({});
  });

  it("publishes only a deliberately edited company name, with no company required", () => {
    const intake = { ...noRate, lookingToHire: true, availableForWork: false, companyNamePublic: false,
      companyName: "Intake-only company", companyUrl: null };
    expect(toProfilePreferences(intake)).not.toHaveProperty("companyNamePublic");
    expect(toProfilePreferences(intake).companyName).toBeNull();
    expect(parseProfilePatch({ lookingToHire: true }, noRate)).not.toHaveProperty("companyNamePublic");
    expect(parseProfilePatch({ companyName: "  Public Studio  " }, noRate)).toEqual({ companyName: "Public Studio", companyNamePublic: true });
    expect(parseProfilePatch({ companyName: null, companyUrl: null }, noRate)).toEqual({ companyName: null, companyNamePublic: false, companyUrl: null });
    expect(toProfilePreferences({ ...intake, companyNamePublic: true }).companyName).toBe(intake.companyName);
    for (const badName of [17, "   ", "A".repeat(101), "a\u0000b", "Name\nName", "Name\udbff"]) invalid({ companyName: badName }, "companyName");
  });

  it.each([
    "http://example.test", "//example.test", "https:example.test", "javascript:alert(1)",
    "https://user:password@example.test", "https://", "https://example.test/a b", "https://ex\nample.test", `https://example.test/${"a".repeat(255)}`,
  ])("rejects unsafe or invalid company website %s", (url) => {
    expect(companyWebsite(url)).toBeNull();
    invalid({ companyUrl: url }, "companyUrl");
  });

  it("accepts a normalized HTTPS company website", () => {
    expect(parseProfilePatch({ companyUrl: " https://Studio.example/about " }, noRate)).toEqual({ companyUrl: "https://studio.example/about" });
    invalid({ companyUrl: 42 }, "companyUrl");
  });

  it("sets, merges, and clears the optional hourly pair without changing intents", () => {
    expect(parseProfilePatch(usd, noRate)).toEqual(usd);
    expect(parseProfilePatch({ hourlyRate: 91 }, usd)).toEqual({ hourlyRate: 91, hourlyCurrency: "USD" });
    expect(parseProfilePatch({ hourlyCurrency: "GBP" }, usd)).toEqual({ hourlyRate: 80, hourlyCurrency: "GBP" });
    expect(parseProfilePatch({ hourlyRate: null }, usd)).toEqual(noRate);
    expect(parseProfilePatch({ hourlyCurrency: null }, usd)).toEqual(noRate);
    expect(parseProfilePatch({ ...noRate }, usd)).toEqual(noRate);
    invalid({ hourlyRate: 80 }, "hourlyCurrency");
    invalid({ hourlyCurrency: "USD" }, "hourlyRate");
    invalid({ hourlyRate: null, hourlyCurrency: "USD" }, "hourlyRate", usd);
    invalid({ hourlyRate: 80, hourlyCurrency: null }, "hourlyCurrency", usd);
    for (const amount of [0, -40, 4.75, "50", Infinity, MAX_HOURLY_RATE + 1]) invalid({ hourlyRate: amount, hourlyCurrency: "USD" }, "hourlyRate");
    for (const currency of ["usd", "CAD", 7, ""]) invalid({ hourlyRate: 80, hourlyCurrency: currency }, "hourlyCurrency");
  });
});
