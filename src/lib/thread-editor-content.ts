import type { JSONContent } from "@tiptap/core";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { Definition, Parent, PhrasingContent, RootContent } from "mdast";
import { normalizeContentHref } from "./markdown";

type Marks = NonNullable<JSONContent["marks"]>;

/** Load saved CommonMark as editor nodes, never as editable HTML. */
export function parseThreadBody(source: string): JSONContent {
  const tree = fromMarkdown(source);
  const definitions = new Map<string, Definition>();
  function collectDefinitions(parent: Parent) {
    for (const child of parent.children) {
      if (child.type === "definition" && !definitions.has(child.identifier)) definitions.set(child.identifier, child);
      if ("children" in child) collectDefinitions(child);
    }
  }
  collectDefinitions(tree);

  function inlines(nodes: PhrasingContent[], marks: Marks = []): JSONContent[] {
    return nodes.flatMap<JSONContent>((node) => {
      switch (node.type) {
        case "text":
          return node.value ? [{ type: "text", text: node.value.replace(/ *\n */g, " "), marks }] : [];
        case "break": return [{ type: "hardBreak", marks }];
        case "inlineCode":
          return node.value ? [{ type: "text", text: node.value, marks: [...marks, { type: "code" }] }] : [];
        case "strong":
        case "emphasis": {
          const type = node.type === "strong" ? "bold" : "italic";
          return inlines(node.children, marks.some((mark) => mark.type === type) ? marks : [...marks, { type }]);
        }
        case "link":
        case "linkReference": {
          const dest = node.type === "link" ? node : definitions.get(node.identifier);
          const link = normalizeContentHref(dest?.url);
          return inlines(node.children, link ? [...marks, { type: "link", attrs: { href: link.href, title: dest?.title ?? null } }] : marks);
        }
        default: return []; // The published reader also omits HTML and images.
      }
    });
  }

  function blocks(nodes: RootContent[]): JSONContent[] {
    return nodes.flatMap<JSONContent>((node) => {
      switch (node.type) {
        case "paragraph": return [{ type: "paragraph", content: inlines(node.children) }];
        case "heading": return [{ type: "heading", attrs: { level: node.depth }, content: inlines(node.children) }];
        case "thematicBreak": return [{ type: "horizontalRule" }];
        case "code":
          return [{ type: "codeBlock", attrs: { language: node.lang ?? null }, content: node.value ? [{ type: "text", text: node.value }] : [] }];
        case "blockquote": {
          const content = blocks(node.children);
          return [{ type: "blockquote", content: content.length ? content : [{ type: "paragraph" }] }];
        }
        case "list":
          return [{
            type: node.ordered ? "orderedList" : "bulletList",
            attrs: { ...(node.ordered ? { start: node.start ?? 1 } : {}), tight: !node.spread && !node.children.some((item) => item.spread) },
            content: node.children.map((item) => {
              const content = blocks(item.children);
              if (content[0]?.type !== "paragraph") content.unshift({ type: "paragraph" });
              return { type: "listItem", content };
            }),
          }];
        default: return [];
      }
    });
  }

  const content = blocks(tree.children);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}
