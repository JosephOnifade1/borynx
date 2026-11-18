import { fromMarkdown } from "mdast-util-from-markdown";
import type { Root, RootContent } from "mdast";
import { INLINE_RULES, tokenizeInline } from "./autolink";
import { normalizeContentHref } from "./markdown";

const bareURLRules = INLINE_RULES.filter((rule) => rule.name === "url");

/** Feed text and its preview link should come from the same Markdown as the permalink. */
export function threadPreview(source: string, limit = 180) {
  const tree = fromMarkdown(source);
  const definitions = new Map(tree.children.flatMap((node) => node.type === "definition" ? [[node.identifier, node.url]] : []));
  let primaryLink: string | null = null;

  function capture(url: unknown) {
    if (primaryLink) return;
    const link = normalizeContentHref(url);
    if (link?.external) primaryLink = link.href;
  }

  function plainText(node: Root | RootContent, insideLink = false): string {
    switch (node.type) {
      case "code": case "html": case "image": case "imageReference": case "definition": return "";
      case "break": case "thematicBreak": return " ";
      case "inlineCode": return node.value;
      case "text": {
        if (!primaryLink && !insideLink) {
          for (const token of tokenizeInline(node.value, bareURLRules)) {
            if (token.type === "link") capture(token.href);
          }
        }
        return node.value;
      }
      case "link": case "linkReference": {
        capture(node.type === "link" ? node.url : definitions.get(node.identifier));
        return node.children.map((child) => plainText(child, true)).join("");
      }
      default: {
        if (!("children" in node)) return "";
        const inline = node.type === "heading" || node.type === "paragraph" || node.type === "emphasis" || node.type === "strong";
        return node.children.map((child) => plainText(child, insideLink)).join(inline ? "" : " ");
      }
    }
  }

  const text = plainText(tree).replace(/\s+/g, " ").trim();
  const excerpt = text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
  return { excerpt, primaryLink };
}
