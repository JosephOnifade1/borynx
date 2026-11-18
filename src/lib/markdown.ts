import type { Link, Parent, PhrasingContent, Root, RootContent } from "mdast";
import { INLINE_RULES, tokenizeInline, type InlineToken } from "./autolink";

type ContentReference = { kind: "user" | "space"; name: string; legacy?: boolean };

/** Only genuine app paths, document anchors, and explicit HTTP(S) destinations. */
export function normalizeContentHref(raw: unknown): { href: string; external: boolean } | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 32 || code === 127 || value[i] === "\\") return null;
  }

  try {
    if (value.startsWith("#")) return { href: value, external: false };
    if (value.startsWith("/") && !value.startsWith("//")) {
      const url = new URL(value, "https://borynx.invalid");
      if (url.pathname.startsWith("//")) return null;
      return { href: `${url.pathname}${url.search}${url.hash}`, external: false };
    }
    if (!/^https?:\/\/[^/]/i.test(value)) return null;
    const url = new URL(value);
    if (!url.hostname || url.username || url.password) return null;
    return { href: url.href, external: true };
  } catch {
    return null;
  }
}

const linkRules = INLINE_RULES.filter(({ name }) => name === "url" || name === "user" || name === "space");

function referenceLink(url: string, label: string, ref: ContentReference): Link {
  return {
    type: "link",
    url,
    children: [{ type: "text", value: label }],
    data: {
      hProperties: {
        "data-bx-reference": ref.kind,
        "data-bx-name": ref.name,
        "data-bx-legacy": ref.legacy ? "true" : "false",
      },
    },
  };
}

function linkToken(token: InlineToken): PhrasingContent {
  switch (token.type) {
    case "text":
      return token;
    case "link":
      return { type: "link", url: token.href, children: [{ type: "text", value: token.href }] };
    case "space":
      return referenceLink(token.href, `b/${token.slug}`, { kind: "space", name: token.slug });
    case "user":
      return referenceLink(token.href, `f/${token.username}`, { kind: "user", name: token.username, legacy: token.legacy });
    default:
      throw new Error("Unexpected token in Markdown link rules");
  }
}

/** Expand Borynx shortcuts and bare URLs in prose, never inside code or an existing link. */
export function remarkBorynxLinks() {
  return (tree: Root) => {
    function visit(parent: Parent) {
      parent.children = parent.children.flatMap<RootContent>((child) => {
        if (child.type === "text") return tokenizeInline(child.value, linkRules).map(linkToken);
        if ("children" in child && child.type !== "link" && child.type !== "linkReference") visit(child);
        return [child];
      });
    }
    visit(tree);
  };
}

export function markdownUrlTransform(url: string): string {
  return normalizeContentHref(url)?.href ?? "";
}
