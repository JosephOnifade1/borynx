import { Editor, type JSONContent } from "@tiptap/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { describe, expect, it } from "vitest";
import { markdownUrlTransform, normalizeContentHref, remarkBorynxLinks } from "../markdown";
import { serializeThreadBody, threadEditorExtensions } from "../thread-editor";
import { parseThreadBody } from "../thread-editor-content";
import { threadPreview } from "../thread-preview";

function saveMarkdown(content: JSONContent[]) {
  const editor = new Editor({ element: null, extensions: threadEditorExtensions(), content: { type: "doc", content } });
  try {
    return serializeThreadBody(editor.state.doc);
  } finally {
    editor.destroy();
  }
}

function readMarkdown(source: string) {
  return renderToStaticMarkup(createElement(Markdown, {
    remarkPlugins: [remarkBorynxLinks],
    urlTransform: markdownUrlTransform,
    skipHtml: true,
    disallowedElements: ["img"],
  }, source));
}

const paragraph = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });

describe("thread editor Markdown contract", () => {
  it("preserves marks, headings, hard breaks, nested lists and quotes in the reader", () => {
    const saved = saveMarkdown([
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "How it works" }] },
      { type: "paragraph", content: [
        { type: "text", text: "Bold", marks: [{ type: "bold" }] },
        { type: "text", text: " and " },
        { type: "text", text: "italic", marks: [{ type: "italic" }] },
        { type: "hardBreak" },
        { type: "text", text: "x = 1", marks: [{ type: "code" }] },
      ] },
      { type: "bulletList", content: [{ type: "listItem", content: [
        paragraph("First step"),
        { type: "orderedList", content: [{ type: "listItem", content: [paragraph("Nested step")] }] },
      ] }] },
      { type: "blockquote", content: [paragraph("Quoted text")] },
    ]);
    const rendered = readMarkdown(saved);
    expect(rendered).toContain("<h2>How it works</h2>");
    expect(rendered).toMatch(/<strong>Bold<\/strong> and <em>italic<\/em><br\/>\s*<code>x = 1<\/code>/);
    expect(rendered).toMatch(/<ul>\s*<li>First step\s*<ol>\s*<li>Nested step<\/li>/);
    expect(rendered).toMatch(/<blockquote>\s*<p>Quoted text<\/p>/);
  });

  it("preserves overlapping bold and italic selections without storing HTML", () => {
    const saved = saveMarkdown([{ type: "paragraph", content: [
      { type: "text", text: "First ", marks: [{ type: "bold" }] },
      { type: "text", text: "overlap", marks: [{ type: "bold" }, { type: "italic" }] },
      { type: "text", text: " last", marks: [{ type: "italic" }] },
    ] }]);
    expect(saved).not.toMatch(/<\/?(?:em|strong)>/);
    expect(readMarkdown(saved)).toBe("<p><strong>First <em>overlap</em></strong> <em>last</em></p>");
  });

  it("keeps literal Markdown and HTML syntax as text, including after a hard break", () => {
    const saved = saveMarkdown([{ type: "paragraph", content: [
      { type: "text", text: "# not a heading &lt;em>" },
      { type: "hardBreak" },
      { type: "text", text: "- not a list" },
    ] }]);
    expect(readMarkdown(saved)).toBe("<p># not a heading &amp;lt;em&gt;<br/>\n- not a list</p>");
  });

  it("preserves inline code containing its own backticks and edge spaces", () => {
    const saved = saveMarkdown([{ type: "paragraph", content: [
      { type: "text", text: "  `echo`  ", marks: [{ type: "code" }] },
    ] }]);
    expect(readMarkdown(saved)).toBe("<p><code>  `echo`  </code></p>");
  });

  it("keeps pasted code indentation and shorter fences intact", () => {
    const code = '  int x = 1;\n```\n  int y = 2;';
    const saved = saveMarkdown([
      { type: "codeBlock", attrs: { language: "c++" }, content: [{ type: "text", text: code }] },
      paragraph("After the example"),
    ]);
    expect(saved).toContain(`\`\`\`\`c++\n${code}\n\`\`\`\``);
    expect(readMarkdown(saved)).toContain(`<pre><code class="language-c++">${code}\n</code></pre>`);
    expect(readMarkdown(saved)).toContain("<p>After the example</p>");
  });

  it("preserves link labels and destinations with parentheses and query parameters", () => {
    const href = "https://example.com/api(v2)?one=1&two=2";
    const saved = saveMarkdown([{ type: "paragraph", content: [{ type: "text", text: "the docs", marks: [{ type: "link", attrs: { href } }] }] }]);
    expect(readMarkdown(saved)).toContain('<a href="https://example.com/api(v2)?one=1&amp;two=2">the docs</a>');
    expect(threadPreview(saved)).toEqual({ excerpt: "the docs", primaryLink: href });
  });

  it("uses readable text and skips fenced code when summarizing the thread for the feed", () => {
    const body = "## Start here\n\n````js\nhttps://example.com/not-a-preview\n```\n````\n\nAsk **f/mara_k**. [Read more][guide]\n\n[guide]: https://example.com/guide";
    expect(threadPreview(body)).toEqual({
      excerpt: "Start here Ask f/mara_k. Read more",
      primaryLink: "https://example.com/guide",
    });
  });
});

describe("Borynx Markdown links", () => {
  it("keeps legacy user aliases and space shortcuts without linking code or linked labels", () => {
    const html = readMarkdown("Ask **u/Devrim** in b/devops-cloud. `f/ignored` [f/also-ignored](/l)\n\n```\nf/code-user\n```");
    expect(html).toContain('href="/f/devrim"');
    expect(html).toContain('data-bx-reference="user"');
    expect(html).toContain('data-bx-legacy="true"');
    expect(html).toContain('href="/b/devops-cloud"');
    expect(html).toContain('href="/l"');
    expect(html).not.toContain('href="/f/ignored"');
    expect(html).not.toContain('href="/f/also-ignored"');
    expect(html).not.toContain('href="/f/code-user"');
    expect(html).toContain("<code>f/ignored</code>");
  });

  it("renders old Markdown body formatting, bare URLs and internal paths", () => {
    const html = readMarkdown("# Notes\n\n- **One**\n- *Two*\n\nSee https://example.com/docs or [the board](/l).");
    expect(html).toContain("<h1>Notes</h1>");
    expect(html).toContain("<li><strong>One</strong></li>");
    expect(html).toContain("<li><em>Two</em></li>");
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('<a href="/l">the board</a>');
  });

  it("does not render raw HTML or load external images", () => {
    const html = readMarkdown('Plain <em data-test="pasted">HTML</em>.\n\n![an image](https://example.com/image.png)');
    expect(html).toContain("Plain HTML.");
    expect(html).not.toContain("<em");
    expect(html).not.toContain("<img");
  });

  it.each(["//example.com/path", "/.//example.com/path", "https://", "mailto:team@example.com", "ftp://example.com/a", "https://example.com/has space"])("rejects a destination outside the link policy (%s)", (href) => {
    expect(normalizeContentHref(href)).toBeNull();
    expect(markdownUrlTransform(href)).toBe("");
  });
});

describe("opening saved Markdown for editing", () => {
  it("round trips older headings, named links, lists, breaks, quotes, Borynx refs, and indented fenced code", () => {
    const source = [
      "#### Existing instructions",
      "",
      "Use [**the guide**][guide] or ask u/Devrim in c/devops-cloud.  ",
      "Review `x = 1` first.",
      "",
      '[guide]: <https://example.com/docs(v2)?a=1&b=2> "Read & save"',
      "",
      "3. First item",
      "   - Nested item",
      "4. Second item",
      "",
      "> A useful quote",
      "",
      "````c++",
      "  int x = 1;",
      "```",
      "  int y = 2;",
      "````",
    ].join("\n");
    const content = parseThreadBody(source);
    const saved = saveMarkdown(content.content ?? []);
    expect(readMarkdown(saved)).toBe(readMarkdown(source));
  });

  it("keeps loose lists, linked inline code, and marks across hard breaks", () => {
    const source = "- **Use `--flag` before  \n  continuing.**\n\n- See [`--help`](https://example.com/flags).";
    expect(readMarkdown(saveMarkdown(parseThreadBody(source).content ?? []))).toBe(readMarkdown(source));
  });

  it("keeps text but does not insert raw HTML, remote images, or unsupported links in the editor", () => {
    const content = parseThreadBody('A <em>saved</em> [label](mailto:test@example.com).\n\n![image](https://example.com/image.png)');
    expect(content.content?.[0]).toMatchObject({ type: "paragraph" });
    expect(readMarkdown(saveMarkdown(content.content ?? []))).toBe("<p>A saved label.</p>");
  });
});
