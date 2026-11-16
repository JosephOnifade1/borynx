"use client";

import {
  Bold,
  Code,
  Eye,
  FileCode,
  Italic,
  Link as LinkIcon,
  List,
  Quote,
} from "lucide-react";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

interface MarkdownToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  isPreview?: boolean;
  onTogglePreview?: () => void;
  className?: string;
}

export function MarkdownToolbar({
  textareaRef,
  value,
  onChange,
  isPreview,
  onTogglePreview,
  className,
}: MarkdownToolbarProps) {
  const insertFormat = useCallback(
    (prefix: string, suffix: string = prefix, placeholder: string = "") => {
      const el = textareaRef.current;
      if (!el) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = value.slice(start, end);
      const textToWrap = selected || placeholder;

      const before = value.slice(0, start);
      const after = value.slice(end);
      const nextValue = `${before}${prefix}${textToWrap}${suffix}${after}`;

      onChange(nextValue);

      // Restore focus & selection
      requestAnimationFrame(() => {
        el.focus();
        const cursorStart = start + prefix.length;
        const cursorEnd = cursorStart + textToWrap.length;
        el.setSelectionRange(cursorStart, cursorEnd);
      });
    },
    [textareaRef, value, onChange],
  );

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-1 border-b border-line bg-sunken/40 px-2 py-1 text-[12px]",
        className,
      )}
    >
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => insertFormat("**", "**", "bold text")}
          className="rounded p-1 text-ink-3 hover:bg-surface hover:text-ink transition-colors"
          title="Bold (**text**)"
          aria-label="Bold"
        >
          <Bold size={13} strokeWidth={2.5} />
        </button>

        <button
          type="button"
          onClick={() => insertFormat("*", "*", "italic text")}
          className="rounded p-1 text-ink-3 hover:bg-surface hover:text-ink transition-colors"
          title="Italic (*text*)"
          aria-label="Italic"
        >
          <Italic size={13} strokeWidth={2.5} />
        </button>

        <div className="h-3.5 w-px bg-line mx-1" aria-hidden="true" />

        <button
          type="button"
          onClick={() => insertFormat("`", "`", "code")}
          className="rounded p-1 text-ink-3 hover:bg-surface hover:text-ink transition-colors"
          title="Inline code (`code`)"
          aria-label="Inline code"
        >
          <Code size={13} />
        </button>

        <button
          type="button"
          onClick={() => insertFormat("```ts\n", "\n```", "// your code here")}
          className="rounded p-1 text-ink-3 hover:bg-surface hover:text-ink transition-colors"
          title="Code block (```lang)"
          aria-label="Code block"
        >
          <FileCode size={13} />
        </button>

        <button
          type="button"
          onClick={() => insertFormat("[", "](https://example.com)", "link title")}
          className="rounded p-1 text-ink-3 hover:bg-surface hover:text-ink transition-colors"
          title="Insert link [title](url)"
          aria-label="Insert link"
        >
          <LinkIcon size={13} />
        </button>

        <button
          type="button"
          onClick={() => insertFormat("> ", "", "quote")}
          className="rounded p-1 text-ink-3 hover:bg-surface hover:text-ink transition-colors"
          title="Quote (> text)"
          aria-label="Quote"
        >
          <Quote size={13} />
        </button>

        <button
          type="button"
          onClick={() => insertFormat("- ", "", "item")}
          className="rounded p-1 text-ink-3 hover:bg-surface hover:text-ink transition-colors"
          title="Bulleted list (- item)"
          aria-label="Bulleted list"
        >
          <List size={13} />
        </button>
      </div>

      {onTogglePreview && (
        <button
          type="button"
          onClick={onTogglePreview}
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
            isPreview ? "bg-ember text-white" : "text-ink-3 hover:bg-surface hover:text-ink",
          )}
        >
          <Eye size={12} />
          {isPreview ? "Editing" : "Preview"}
        </button>
      )}
    </div>
  );
}
