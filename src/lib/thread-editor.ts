import type { Node } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { defaultMarkdownSerializer, MarkdownSerializer } from "prosemirror-markdown";
import { normalizeContentHref } from "./markdown";

export function threadEditorExtensions() {
  return [StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    strike: false,
    underline: false,
    link: {
      defaultProtocol: "https",
      openOnClick: false,
      isAllowedUri: (uri) => normalizeContentHref(uri) !== null,
    },
  })];
}

function fenceFor(text: string, minimum: number) {
  let length = minimum;
  for (const match of text.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1);
  return "`".repeat(length);
}

function codeSpanFence(text: string, close = false) {
  const fence = fenceFor(text, 1);
  const pad = text.startsWith("`") || text.endsWith("`") || (text.startsWith(" ") && text.endsWith(" ") && text.trim() !== "");
  if (!pad) return fence;
  return close ? ` ${fence}` : `${fence} `;
}

const { nodes, marks } = defaultMarkdownSerializer;

// Map the editor's schema to CommonMark. Don't serialize its HTML into the body field.
const threadSerializer = new MarkdownSerializer({
  paragraph: nodes.paragraph,
  heading: nodes.heading,
  blockquote: nodes.blockquote,
  horizontalRule: nodes.horizontal_rule,
  bulletList: nodes.bullet_list,
  listItem: nodes.list_item,
  hardBreak: nodes.hard_break,
  orderedList(state, node) {
    const start = node.attrs.start;
    const first = Number.isInteger(start) && start >= 0 && start <= 999_999_999 ? start : 1;
    const width = String(first + node.childCount - 1).length;
    state.renderList(node, " ".repeat(width + 2), (i) => `${String(first + i).padStart(width)}. `);
  },
  codeBlock(state, node) {
    // Enclose pasted snippets with their own fences without changing any code.
    const fence = fenceFor(node.textContent, 3);
    const language = typeof node.attrs.language === "string" ? node.attrs.language.match(/^[\w+.#-]+/)?.[0] ?? "" : "";
    state.write(`${fence}${language}\n`);
    state.text(node.textContent, false);
    state.write("\n");
    state.write(fence);
    state.closeBlock(node);
  },
  text(state, node, parent, index) {
    const atLineStart = index === 0 || parent.child(index - 1).type.name === "hardBreak";
    const text = state.esc(node.text ?? "", atLineStart);
    state.text(atLineStart ? text.replace(/^(\d{1,9})\)(?=\s)/, "$1\\)") : text, false);
  },
}, {
  bold: marks.strong,
  italic: marks.em,
  code: {
    escape: false,
    open: (_state, _mark, parent, index) => codeSpanFence(parent.child(index).text ?? ""),
    close: (_state, _mark, parent, index) => codeSpanFence(parent.child(index - 1).text ?? "", true),
  },
  link: {
    open: (_state, mark) => normalizeContentHref(mark.attrs.href) ? "[" : "",
    close: (_state, mark) => {
      const link = normalizeContentHref(mark.attrs.href);
      if (!link) return "";
      // Angle brackets allow parentheses in the destination. Preserve literal ampersands.
      const href = link.href.replace(/</g, "%3C").replace(/>/g, "%3E").replace(/&/g, "&amp;");
      return `](<${href}>)`;
    },
  },
}, { hardBreakNodeName: "hardBreak", escapeExtraCharacters: /[<>&!=]/g });

export function serializeThreadBody(doc: Node) {
  return threadSerializer.serialize(doc, { tightLists: true }).trim();
}
