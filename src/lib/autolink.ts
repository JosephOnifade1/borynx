/**
 * Inline tokenizer powering <MarkdownRenderer/>.
 *
 * Rules are evaluated left-to-right by earliest match; adding a new shortcode is a matter of
 * appending an `InlineRule`. Legacy prefixes (u/, r/, c/) are normalised to canonical routes.
 *
 * No regex lookbehind is used anywhere (it is a parse error before Safari 16.4 and would take the
 * whole client bundle down). Boundary conditions are expressed as `guard` functions instead.
 */

export type InlineToken =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; children: InlineToken[] }
  | { type: "em"; children: InlineToken[] }
  | { type: "link"; href: string; label: string; external: boolean }
  | { type: "space"; slug: string; href: string; raw: string }
  | { type: "user"; username: string; href: string; raw: string; legacy: boolean };

export interface InlineRule {
  name: string;
  pattern: RegExp;
  /** Checks the text around a match (replaces lookbehind). Return false to skip the match. */
  guard?: (text: string, index: number) => boolean;
  toToken: (match: RegExpExecArray) => InlineToken;
}

export const SPACE_PREFIXES = ["b", "r", "c"] as const;
export const USER_PREFIXES = ["f", "u"] as const;

/** Space slugs: 2–39 chars. */
export const SLUG_PATTERN = "[a-z0-9][a-z0-9_-]{1,38}";
/** Handles: 2–32 chars, may contain dots (f/priya.builds) but never end with one ("thanks f/devrim."). */
export const HANDLE_PATTERN = "[a-z0-9](?:[a-z0-9_.-]{0,30}[a-z0-9_-])";

export const SPACE_REF_REGEX = new RegExp(`(?:${SPACE_PREFIXES.join("|")})/(${SLUG_PATTERN})\\b`, "gi");
export const USER_REF_REGEX = new RegExp(`(?:${USER_PREFIXES.join("|")})/(${HANDLE_PATTERN})\\b`, "gi");

/** Match only when the preceding character is not in `chars` (lookbehind replacement). */
export const notPrecededBy =
  (chars: RegExp) =>
  (text: string, index: number): boolean =>
    index === 0 || !chars.test(text.charAt(index - 1));

/** A reference must not be glued to a word, path, email or domain: `me@f/x`, `site.com/f/x`. */
const refGuard = notPrecededBy(/[\w/@.]/);

export const spaceHref = (slug: string): string => `/b/${slug.toLowerCase()}`;
export const userHref = (username: string): string => `/f/${username.toLowerCase()}`;

const isExternal = (href: string): boolean => /^https?:\/\//i.test(href);

/** `exec` from `from`, skipping matches rejected by `guard`. */
export function execGuarded(pattern: RegExp, text: string, from: number, guard?: InlineRule["guard"]): RegExpExecArray | null {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  re.lastIndex = from;
  for (;;) {
    const m = re.exec(text);
    if (!m) return null;
    if (m[0].length > 0 && (!guard || guard(text, m.index))) return m;
    re.lastIndex = m.index + 1;
  }
}

export const INLINE_RULES: InlineRule[] = [
  {
    name: "code",
    pattern: /`([^`\n]+)`/g,
    toToken: (m) => ({ type: "code", value: m[1] }),
  },
  {
    name: "mdlink",
    pattern: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g,
    toToken: (m) => ({ type: "link", href: m[2], label: m[1], external: isExternal(m[2]) }),
  },
  {
    name: "url",
    pattern: /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g,
    toToken: (m) => ({ type: "link", href: m[0], label: m[0].replace(/^https?:\/\//, ""), external: true }),
  },
  {
    name: "space",
    pattern: SPACE_REF_REGEX,
    guard: refGuard,
    toToken: (m) => ({ type: "space", slug: m[1].toLowerCase(), href: spaceHref(m[1]), raw: m[0] }),
  },
  {
    name: "user",
    pattern: USER_REF_REGEX,
    guard: refGuard,
    toToken: (m) => ({
      type: "user",
      username: m[1].toLowerCase(),
      href: userHref(m[1]),
      raw: m[0],
      legacy: !m[0].toLowerCase().startsWith("f/"),
    }),
  },
  {
    name: "strong",
    pattern: /\*\*([^*\n]+)\*\*/g,
    toToken: (m) => ({ type: "strong", children: tokenizeInline(m[1]) }),
  },
  {
    name: "em",
    pattern: /\*([^*\n]+)\*(?![\w*])/g,
    guard: notPrecededBy(/[\w*]/),
    toToken: (m) => ({ type: "em", children: tokenizeInline(m[1]) }),
  },
  {
    name: "em_underscore",
    pattern: /_([^_\n]+)_(?!\w)/g,
    guard: notPrecededBy(/\w/),
    toToken: (m) => ({ type: "em", children: tokenizeInline(m[1]) }),
  },
];

function earliestMatch(text: string, from: number, rules: readonly InlineRule[]): { index: number; length: number; token: InlineToken } | null {
  let best: { index: number; match: RegExpExecArray; rule: InlineRule } | null = null;
  for (const rule of rules) {
    const m = execGuarded(rule.pattern, text, from, rule.guard);
    if (m && (!best || m.index < best.index)) best = { index: m.index, match: m, rule };
  }
  return best ? { index: best.index, length: best.match[0].length, token: best.rule.toToken(best.match) } : null;
}

export function tokenizeInline(text: string, rules: readonly InlineRule[] = INLINE_RULES): InlineToken[] {
  const tokens: InlineToken[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const next = earliestMatch(text, cursor, rules);
    if (!next) {
      tokens.push({ type: "text", value: text.slice(cursor) });
      break;
    }
    if (next.index > cursor) tokens.push({ type: "text", value: text.slice(cursor, next.index) });
    tokens.push(next.token);
    cursor = next.index + next.length;
  }
  return tokens;
}

function scanRefs(text: string, pattern: RegExp): string[] {
  const out = new Set<string>();
  let from = 0;
  for (;;) {
    const m = execGuarded(pattern, text, from, refGuard);
    if (!m) break;
    out.add(m[1].toLowerCase());
    from = m.index + m[0].length;
  }
  return [...out];
}

/** Unique mentioned usernames (canonicalised) — used for notifications & hover prefetch. */
export function extractUserMentions(text: string): string[] {
  return scanRefs(text, USER_REF_REGEX);
}

export function extractSpaceMentions(text: string): string[] {
  return scanRefs(text, SPACE_REF_REGEX);
}

/* ------------------------------------------------------------------ */
/* Block-level parsing                                                 */
/* ------------------------------------------------------------------ */

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; inline: InlineToken[] }
  | { type: "paragraph"; inline: InlineToken[] }
  | { type: "quote"; inline: InlineToken[] }
  | { type: "codeblock"; lang: string; code: string }
  | { type: "list"; ordered: boolean; items: InlineToken[][] }
  | { type: "rule" };

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ type: "codeblock", lang: fence[1], code: code.join("\n") });
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, inline: tokenizeInline(heading[2]) });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", inline: tokenizeInline(quote.join(" ")) });
      continue;
    }
    const listMatch = /^(\s*)([-*]|\d+\.)\s+(.+)$/.exec(line);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[2]);
      const items: InlineToken[][] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.+)$/.exec(lines[i]);
        if (!m) break;
        items.push(tokenizeInline(m[3]));
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,3}\s|```|>\s?|(\s*)([-*]|\d+\.)\s)/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", inline: tokenizeInline(para.join(" ")) });
  }
  return blocks;
}
