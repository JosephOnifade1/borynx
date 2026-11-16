"use client";

import Link from "next/link";
import { memo, useMemo, type ReactNode } from "react";
import { parseBlocks, tokenizeInline, type Block, type InlineToken } from "@/lib/autolink";
import { cn } from "@/lib/utils";
import { UserHoverCard } from "./UserHoverCard";

/**
 * Renders Borynx-flavoured markdown. Auto-links `b/space`, `f/user` (and legacy `u/user`),
 * bare URLs, and markdown links. User refs get a hover preview on desktop.
 */
export const MarkdownRenderer = memo(function MarkdownRenderer({ source, className, inline = false }: { source: string; className?: string; inline?: boolean }) {
  const content = useMemo(() => (inline ? renderInline(tokenizeInline(source)) : parseBlocks(source).map((b, i) => renderBlock(b, i))), [source, inline]);
  if (inline) return <span className={className}>{content}</span>;
  return <div className={cn("prose-bx", className)}>{content}</div>;
});

export function renderInline(tokens: InlineToken[]): ReactNode[] {
  return tokens.map((t, i) => {
    switch (t.type) {
      case "text":
        return <span key={i}>{t.value}</span>;
      case "code":
        return <code key={i}>{t.value}</code>;
      case "strong":
        return <strong key={i}>{renderInline(t.children)}</strong>;
      case "em":
        return <em key={i}>{renderInline(t.children)}</em>;
      case "link":
        return t.external ? (
          <a key={i} href={t.href} target="_blank" rel="noopener noreferrer nofollow ugc">
            {t.label}
          </a>
        ) : (
          <Link key={i} href={t.href}>
            {t.label}
          </Link>
        );
      case "space":
        return (
          <Link key={i} href={t.href} className="ref-chip ref-chip-space" title={`Open b/${t.slug}`}>
            b/{t.slug}
          </Link>
        );
      case "user":
        return (
          <UserHoverCard key={i} username={t.username}>
            <Link href={t.href} className="ref-chip ref-chip-user" title={t.legacy ? `Legacy reference → f/${t.username}` : `Open f/${t.username}`}>
              f/{t.username}
            </Link>
          </UserHoverCard>
        );
    }
  });
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as const;
      return <Tag key={key}>{renderInline(block.inline)}</Tag>;
    }
    case "paragraph":
      return <p key={key}>{renderInline(block.inline)}</p>;
    case "quote":
      return <blockquote key={key}>{renderInline(block.inline)}</blockquote>;
    case "codeblock":
      return (
        <pre key={key} data-lang={block.lang || undefined}>
          <code>{block.code}</code>
        </pre>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag key={key}>
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </Tag>
      );
    }
    case "rule":
      return <hr key={key} />;
  }
}
