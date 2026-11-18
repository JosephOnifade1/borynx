"use client";

import type { Editor, JSONContent } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { Bold, Code, FileCode, Heading2, Italic, Link2, List, ListOrdered, Quote, Redo2, Undo2, type LucideIcon } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { normalizeContentHref } from "@/lib/markdown";
import { threadEditorExtensions } from "@/lib/thread-editor";
import { cn } from "@/lib/utils";

const extensions = threadEditorExtensions();
const hint = "Share the context, what you tried, and what you need.";

export function useThreadEditor(initialContent?: JSONContent) {
  return useEditor({
    extensions,
    content: initialContent ?? { type: "doc", content: [{ type: "paragraph" }] },
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: "prose-bx thread-editor-content min-h-60 px-4 py-3",
        role: "textbox",
        "aria-label": "Thread body",
        "aria-multiline": "true",
        "aria-required": "true",
        "aria-placeholder": hint,
      },
    },
  });
}

type Format = {
  label: string;
  icon: LucideIcon;
  active: (editor: Editor) => boolean;
  run: (editor: Editor) => boolean;
};

const formats: Format[] = [
  { label: "Bold", icon: Bold, active: (e) => e.isActive("bold"), run: (e) => e.chain().focus().toggleBold().run() },
  { label: "Italic", icon: Italic, active: (e) => e.isActive("italic"), run: (e) => e.chain().focus().toggleItalic().run() },
  { label: "Heading", icon: Heading2, active: (e) => e.isActive("heading", { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: "Bulleted list", icon: List, active: (e) => e.isActive("bulletList"), run: (e) => e.chain().focus().toggleBulletList().run() },
  { label: "Numbered list", icon: ListOrdered, active: (e) => e.isActive("orderedList"), run: (e) => e.chain().focus().toggleOrderedList().run() },
  { label: "Quote", icon: Quote, active: (e) => e.isActive("blockquote"), run: (e) => e.chain().focus().toggleBlockquote().run() },
  { label: "Inline code", icon: Code, active: (e) => e.isActive("code"), run: (e) => e.chain().focus().toggleCode().run() },
  { label: "Code block", icon: FileCode, active: (e) => e.isActive("codeBlock"), run: (e) => e.chain().focus().toggleCodeBlock().run() },
];

function ToolbarButton({ label, icon: Icon, onClick, active, expanded, controls, disabled, title }: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
  expanded?: boolean;
  controls?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      aria-expanded={expanded}
      aria-controls={controls}
      disabled={disabled}
      title={title ?? label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid size-11 place-items-center rounded disabled:opacity-40 sm:size-9",
        active ? "bg-ember-soft text-ember" : "text-ink-3 hover:bg-surface hover:text-ink",
      )}
    >
      <Icon size={17} aria-hidden="true" />
    </button>
  );
}

export function ThreadEditor({ editor }: { editor: Editor | null }) {
  const linkInputId = useId();
  const linkPanelId = `${linkInputId}-panel`;
  const linkErrorId = `${linkInputId}-error`;
  const [link, setLink] = useState<{ value: string; existing: boolean } | null>(null);
  const [linkError, setLinkError] = useState("");
  const state = useEditorState({
    editor,
    selector: ({ editor }) => editor ? {
      empty: editor.isEmpty,
      textLength: editor.getText().length,
      codeBlock: editor.isActive("codeBlock"),
      canLink: !editor.isActive("codeBlock") && !editor.isActive("code"),
      linked: editor.isActive("link"),
      active: formats.map((format) => format.active(editor)),
      undo: editor.can().undo(),
      redo: editor.can().redo(),
    } : null,
  });

  function openLink() {
    if (!editor || editor.isActive("codeBlock") || editor.isActive("code")) return;
    const href: unknown = editor.getAttributes("link").href;
    setLink({ value: typeof href === "string" ? href : "", existing: editor.isActive("link") });
    setLinkError("");
  }

  function closeLink() {
    setLink(null);
    editor?.commands.focus();
  }

  function saveLink() {
    if (!editor || !link) return;
    const destination = normalizeContentHref(link.value);
    if (!destination) {
      setLinkError("Enter a valid web URL (https://…) or an internal path such as /b/software.");
      return;
    }
    const { href } = destination;
    const command = editor.chain().focus();
    const empty = editor.state.selection.empty;
    const applied = empty && !editor.isActive("link")
      ? command.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run()
      : (empty ? command.extendMarkRange("link") : command).setLink({ href }).run();
    if (!applied) {
      setLinkError("Select text outside a code block to add a link.");
      return;
    }
    setLink(null);
  }

  function handleShortcut(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      event.stopPropagation();
      if (!link) openLink();
    } else if (link && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeLink();
    }
  }

  return (
    <div data-bx-editor onKeyDownCapture={handleShortcut} className="rounded-md border border-line bg-surface focus-within:border-ink-3">
      <div role="group" aria-label="Thread formatting" className="flex flex-wrap items-center gap-0.5 rounded-t-md border-b border-line bg-sunken/40 px-2 py-1">
        {formats.map(({ label, icon, run }, i) => (
          <ToolbarButton key={label} label={label} icon={icon} active={state?.active[i] ?? false} disabled={!editor || (state?.codeBlock && label !== "Code block")} onClick={() => { if (editor) run(editor); }} />
        ))}
        <ToolbarButton label="Link" icon={Link2} active={state?.linked ?? false} expanded={!!link} controls={link ? linkPanelId : undefined} disabled={!state?.canLink} title="Link (Ctrl/⌘+K)" onClick={link ? closeLink : openLink} />
        <div aria-hidden="true" className="mx-1 h-4 w-px bg-line" />
        <ToolbarButton label="Undo" icon={Undo2} disabled={!state?.undo} onClick={() => editor?.chain().focus().undo().run()} />
        <ToolbarButton label="Redo" icon={Redo2} disabled={!state?.redo} onClick={() => editor?.chain().focus().redo().run()} />
      </div>
      {link && (
        <div id={linkPanelId} className="space-y-2 border-b border-line bg-sunken/25 px-4 py-3">
          <label htmlFor={linkInputId} className="eyebrow">Link destination</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={linkInputId}
              autoFocus
              className="field min-w-0 flex-1"
              value={link.value}
              inputMode="url"
              spellCheck={false}
              autoCapitalize="none"
              placeholder="https:// or /b/…"
              aria-invalid={!!linkError}
              aria-describedby={linkError ? linkErrorId : undefined}
              onChange={(event) => { setLink({ ...link, value: event.target.value }); setLinkError(""); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  saveLink();
                }
              }}
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={saveLink}>Apply link</button>
            {link.existing && (
              <button type="button" className="btn btn-sm" onClick={() => {
                editor?.chain().focus().extendMarkRange("link").unsetLink().run();
                setLink(null);
              }}>Remove link</button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={closeLink}>Cancel</button>
          </div>
          {linkError && <p id={linkErrorId} role="alert" className="text-[12px] text-danger">{linkError}</p>}
        </div>
      )}
      <div className="relative">
        {state?.empty && <p aria-hidden="true" className="pointer-events-none absolute left-4 top-3 pr-4 text-[14.5px] leading-[1.65] text-ink-4">{hint}</p>}
        {editor ? <EditorContent editor={editor} /> : <p className="min-h-60 px-4 py-3 text-sm text-ink-4">Loading editor…</p>}
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 rounded-b-md border-t border-line px-4 py-2 text-[11.5px] text-ink-3">
        <span>Reference spaces with <span className="num">b/space</span> and people with <span className="num">f/handle</span>.</span>
        <span className="num">{state?.textLength ?? 0} characters</span>
      </div>
    </div>
  );
}
