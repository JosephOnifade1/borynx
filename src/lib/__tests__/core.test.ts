import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { hotScore, rankItems, wilsonLowerBound, topScore } from "../sorting";
import { tokenizeInline, parseBlocks, extractUserMentions, extractSpaceMentions } from "../autolink";
import { karmaForPostVote, karmaForSolution, karmaForCommentVote, multiplierToPercent } from "../karma";
import { evaluateContent } from "../safety";
import { buildShareUrl, slugify } from "../utils";

const HOUR = 3_600_000;
const now = Date.parse("2026-03-01T12:00:00Z");

describe("sorting — hot", () => {
  it("scales votes logarithmically", () => {
    const a = hotScore({ upvotes: 10, downvotes: 0, createdAt: now }, now);
    const b = hotScore({ upvotes: 100, downvotes: 0, createdAt: now }, now);
    const c = hotScore({ upvotes: 1000, downvotes: 0, createdAt: now }, now);
    expect(b - a).toBeCloseTo(1, 5);
    expect(c - b).toBeCloseTo(1, 5);
  });
  it("decays with age so fresher content with fewer votes can win", () => {
    const fresh = hotScore({ upvotes: 12, downvotes: 0, createdAt: now - HOUR }, now);
    const stale = hotScore({ upvotes: 120, downvotes: 0, createdAt: now - 48 * HOUR }, now);
    expect(fresh).toBeGreaterThan(stale);
  });
  it("rewards discussion velocity", () => {
    const quiet = hotScore({ upvotes: 5, downvotes: 0, commentCount: 0, createdAt: now }, now);
    const lively = hotScore({ upvotes: 5, downvotes: 0, commentCount: 40, createdAt: now }, now);
    expect(lively).toBeGreaterThan(quiet);
  });
  it("treats negative scores symmetrically", () => {
    expect(hotScore({ upvotes: 0, downvotes: 10, createdAt: now }, now)).toBeCloseTo(-1, 5);
  });
});

describe("sorting — wilson / top", () => {
  it("returns 0 with no samples", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });
  it("penalises small sample sizes", () => {
    expect(wilsonLowerBound(3, 0)).toBeLessThan(wilsonLowerBound(180, 12));
  });
  it("is bounded in [0, 1] and monotonic in positive ratio", () => {
    const low = wilsonLowerBound(50, 50);
    const high = wilsonLowerBound(90, 10);
    expect(low).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThanOrEqual(1);
    expect(high).toBeGreaterThan(low);
  });
  it("rankItems orders by mode and is stable", () => {
    const items = [
      { id: 1, upvotes: 3, downvotes: 0, createdAt: now - 2 * HOUR },
      { id: 2, upvotes: 180, downvotes: 12, createdAt: now - 72 * HOUR },
      { id: 3, upvotes: 0, downvotes: 0, createdAt: now },
    ];
    expect(rankItems(items, "top").map((i) => i.id)).toEqual([2, 1, 3]);
    expect(rankItems(items, "new").map((i) => i.id)).toEqual([3, 1, 2]);
    expect(topScore(items[1])).toBeGreaterThan(topScore(items[0]));
  });
});

describe("autolink tokenizer", () => {
  it("links space and user references", () => {
    const tokens = tokenizeInline("Ask in b/devops-cloud or ping f/mara_k for help");
    const space = tokens.find((t) => t.type === "space");
    const user = tokens.find((t) => t.type === "user");
    expect(space && space.type === "space" ? space.href : null).toBe("/b/devops-cloud");
    expect(user && user.type === "user" ? user.href : null).toBe("/f/mara_k");
  });
  it("normalises legacy u/ shortcodes to /f/", () => {
    const tokens = tokenizeInline("thanks u/Devrim");
    const user = tokens.find((t) => t.type === "user");
    expect(user && user.type === "user" ? { href: user.href, legacy: user.legacy } : null).toEqual({ href: "/f/devrim", legacy: true });
  });
  it("does not autolink inside urls or emails", () => {
    const tokens = tokenizeInline("see https://example.com/f/not-a-user and mail me@f/nope");
    expect(tokens.some((t) => t.type === "user")).toBe(false);
    expect(tokens.some((t) => t.type === "link")).toBe(true);
  });
  it("handles inline code, bold, and markdown links", () => {
    const tokens = tokenizeInline("run `npm i` then **read** [docs](https://x.dev/a)");
    expect(tokens.map((t) => t.type)).toEqual(["text", "code", "text", "strong", "text", "link"]);
  });
  it("extracts mentions", () => {
    expect(extractUserMentions("f/ana u/bo f/ANA")).toEqual(["ana", "bo"]);
    expect(extractSpaceMentions("b/xo and r/yo")).toEqual(["xo", "yo"]);
  });
  it("parses block structure", () => {
    const blocks = parseBlocks("# Title\n\n- one\n- two\n\n```ts\nconst a = 1\n```\n> quoted");
    expect(blocks.map((b) => b.type)).toEqual(["heading", "list", "codeblock", "quote"]);
  });
});

describe("markdown block parser — forward progress", () => {
  function parseWithinLimit(markdown: string): ReturnType<typeof parseBlocks> {
    // A synchronous parser loop would block the test runner's normal timeout.
    return runInNewContext("parseBlocks(markdown)", { parseBlocks, markdown }, { timeout: 250 });
  }

  it("renders fenced code with a language label like c++", () => {
    const blocks = parseWithinLimit("Example:\n``` c++\nint main() { return 0; }\n```\nDone.");
    expect(blocks).toEqual([
      { type: "paragraph", inline: [{ type: "text", value: "Example:" }] },
      { type: "codeblock", lang: "c++", code: "int main() { return 0; }" },
      { type: "paragraph", inline: [{ type: "text", value: "Done." }] },
    ]);
  });

  it("keeps shorter backtick fences inside a longer code block", () => {
    const code = "```ts\nconst a = 1\n```";
    const blocks = parseWithinLimit(`\`\`\`\`markdown\n${code}\n\`\`\`\`\n# After`);
    expect(blocks).toEqual([
      { type: "codeblock", lang: "markdown", code },
      { type: "heading", level: 1, inline: [{ type: "text", value: "After" }] },
    ]);
  });

  it.each(["# ", "##\t ", "- ", "* ", "1. "])("renders an unfinished marker as text (%j)", (marker) => {
    expect(parseWithinLimit(`${marker}\n# After`)).toEqual([
      { type: "paragraph", inline: [{ type: "text", value: marker }] },
      { type: "heading", level: 1, inline: [{ type: "text", value: "After" }] },
    ]);
  });
});

describe("karma multipliers", () => {
  it("applies 1.5x to resource and help posts", () => {
    expect(karmaForPostVote("resource", 2).amount).toBe(3);
    expect(karmaForPostVote("help", 1).amount).toBe(2); // rounds 1.5 → 2
    expect(karmaForPostVote("discussion", 2).amount).toBe(2);
  });
  it("applies 10x to accepted solutions and reverses on revoke", () => {
    expect(karmaForSolution().amount).toBe(50);
    expect(karmaForSolution(true).amount).toBe(-50);
    expect(karmaForSolution().multiplier).toBe(10);
  });
  it("stores multipliers as integer percent", () => {
    expect(multiplierToPercent(1.5)).toBe(150);
    expect(karmaForCommentVote(-1).amount).toBe(-1);
  });
});

describe("safety + share", () => {
  it("blocks scammy link-spam and allows clean text", () => {
    const bad = evaluateContent("GUARANTEED INCOME send a deposit http://a.xyz http://b.xyz http://c.xyz http://d.xyz");
    expect(bad.allowed).toBe(false);
    expect(evaluateContent("Looking for a senior React Native contractor, 3 months, offline-first sync.").allowed).toBe(true);
  });
  it("builds attributed share urls", () => {
    const url = new URL(buildShareUrl("/p/12", 7, "https://borynx.app", "abc123"));
    expect(url.searchParams.get("ref_id")).toBe("7");
    expect(url.searchParams.get("share_id")).toBe("abc123");
    expect(slugify("Hello, Wörld! ")).toBe("hello-world");
  });
});

describe("autolink — browser-compat guards", () => {
  it("supports dotted handles without swallowing a sentence-ending period", () => {
    expect(extractUserMentions("cc f/priya.builds and thanks f/devrim.")).toEqual(["priya.builds", "devrim"]);
  });
  it("still rejects references glued to emails, paths and words", () => {
    expect(extractUserMentions("mail me@f/nope, see site.com/f/nope, or xf/nope")).toEqual([]);
    expect(extractSpaceMentions("(b/devops-cloud)")).toEqual(["devops-cloud"]);
  });
  it("keeps snake_case handles intact (no false italics)", () => {
    const tokens = tokenizeInline("pair f/mara_k with f/ines_ml");
    expect(tokens.filter((t) => t.type === "user").length).toBe(2);
    expect(tokens.some((t) => t.type === "em")).toBe(false);
  });
  it("uses no regex lookbehind (unsupported before Safari 16.4)", async () => {
    const mod = await import("../autolink");
    const sources = [mod.SPACE_REF_REGEX, mod.USER_REF_REGEX, ...mod.INLINE_RULES.map((r) => r.pattern)].map((r) => r.source);
    expect(sources.some((src) => src.includes("(?<!") || src.includes("(?<="))).toBe(false);
  });
});
