import { describe, expect, it } from "vitest";
import { hasLeadFilters, leadFiltersParams, leadSeekToken, parseLeadAuthor, parseLeadFilters, parseLeadPaging, readLeadPageFilters } from "../lead-discovery";

const filters = (query: string) => parseLeadFilters(new URLSearchParams(query));
const parsePage = (query: string, scope: Parameters<typeof parseLeadPaging>[1] = "new") => parseLeadPaging(new URLSearchParams(query), scope);

describe("lead discovery filters", () => {
  it("shares normalization and serialization between SSR, forms, and HTTP", () => {
    const query = "currency=USD&unit=fixed&min=00050&max=500&skill=Node.js&skill=REACT&skill=nodejs&active=1";
    const parsed = filters(query);
    expect(parsed).toMatchObject({ sort: "new", currency: "USD", unit: "fixed", min: 50, max: 500, skills: ["node-js", "react"], openOnly: true });
    expect(leadFiltersParams(parsed).toString()).toBe("currency=USD&unit=fixed&min=50&max=500&active=1&skill=node-js&skill=react");
    expect(parseLeadFilters(leadFiltersParams(parsed))).toEqual(parsed);
    expect(readLeadPageFilters({ currency: "USD", unit: "fixed", min: "00050", max: "500", skill: ["Node.js", "REACT", "nodejs"], active: "1" })).toEqual({ filters: parsed });
  });

  it("accepts one-sided ranges and zero with explicit comparable units", () => {
    expect(filters("currency=GBP&unit=hourly&min=0")).toMatchObject({ min: 0, max: undefined, unit: "hourly" });
    expect(filters("currency=EUR&unit=fixed&max=10000000")).toMatchObject({ min: undefined, max: 10_000_000 });
    expect(hasLeadFilters(filters("unit=hourly"))).toBe(true);
    expect(hasLeadFilters(filters("verified=0&active=0"))).toBe(false);
    expect(leadFiltersParams(filters("sort=top")).toString()).toBe("sort=top");
  });

  it.each([
    ["min=50", "currency"], ["currency=EUR&max=200", "unit"], ["currency=USD&unit=fixed&min=30&max=20", "max"],
    ["currency=USD&unit=fixed&min=2.5", "min"], ["currency=USD&unit=fixed&min=4e2", "min"],
    ["currency=USD&unit=fixed&min=-5", "min"], ["currency=USD&unit=fixed&max=10000001", "max"],
    ["currency=USD&currency=EUR", "currency"], ["currency=JPY", "currency"], ["unit=monthly", "unit"],
    ["sort=new&sort=hot", "sort"], ["sort=old", "sort"], ["sort=hot&skill=react", "sort"], ["sort=top&kind=contract", "sort"],
    ["skill=constructor", "skill"], ["skill=react,nodejs", "skill"], ["skill=go&skill=rust&skill=java&skill=testing&skill=sql&skill=design-systems&skill=react", "skill"],
    [Array.from({ length: 25 }, () => "skill=react").join("&"), "skill"], ["kind=any", "kind"], ["category=Invalid", "category"], ["active=yes", "active"],
  ])("rejects invalid filters (%s) with a field error", (query, field) => {
    expect(() => filters(query)).toThrow(expect.objectContaining({ status: 422, code: "invalid_lead_filters", fields: { [field]: expect.any(String) } }));
  });

  it("presents an error rather than treating a bad deep link as matching everything", () => {
    expect(readLeadPageFilters({ skill: "unknown" })).toEqual({ filters: { sort: "new", skills: [] }, filterError: "Choose skills from the catalogue." });
    expect(parseLeadAuthor(new URLSearchParams("author=old.handle"))).toBe("old.handle");
    expect(() => parseLeadAuthor(new URLSearchParams("author=%00"))).toThrow(expect.objectContaining({ status: 422 }));
  });
});

describe("lead pagination inputs", () => {
  const stamp = "2026-10-20T09:30:08.123456Z";
  it("defaults to 25, bounds the page size, and preserves microseconds in both seek scopes", () => {
    expect(parsePage("cursor=0")).toEqual({ limit: 25 });
    expect(parsePage(`cursor=${leadSeekToken("new", stamp, 17)}&limit=50`)).toEqual({ limit: 50, cursor: { scope: "new", time: stamp, id: 17 } });
    expect(parsePage(`cursor=${leadSeekToken("saved", stamp, 1)}`, "saved")).toEqual({ limit: 25, cursor: { scope: "saved", time: stamp, id: 1 } });
    expect(parsePage("cursor=hot:399", "hot")).toEqual({ limit: 25, cursor: { scope: "hot", offset: 399 } });
    expect(() => parsePage("cursor=hot:400", "hot")).toThrow(expect.objectContaining({ status: 400, code: "invalid_cursor" }));
  });

  it.each(["limit=0", "limit=51", "limit=2.5", "limit=1&limit=4"])("rejects invalid page sizes (%s)", (query) => {
    expect(() => parsePage(query)).toThrow(expect.objectContaining({ status: 422, fields: { limit: expect.any(String) } }));
  });

  it.each([
    "cursor=", "cursor=-25", "cursor=25", "cursor=NaN", "cursor=0&cursor=0", `cursor=saved:${stamp}:17`,
    "cursor=new:2026-02-30T00:00:00.000000Z:1", "cursor=new:2026-01-01T24:00:00.000000Z:1", `cursor=new:${stamp}:2147483648`,
    `cursor=new:${stamp}:0`, "cursor=new:2026-01-01T01:00:00.001Z:1",
  ])("rejects invalid New cursors (%s)", (query) => {
    expect(() => parsePage(query)).toThrow(expect.objectContaining({ status: 400, code: "invalid_cursor" }));
  });
});
