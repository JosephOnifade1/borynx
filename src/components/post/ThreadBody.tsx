import Link from "next/link";
import Markdown, { type Components } from "react-markdown";
import { markdownUrlTransform, normalizeContentHref, remarkBorynxLinks } from "@/lib/markdown";
import { UserHoverCard } from "../UserHoverCard";

const components: Components = {
  a({ href, node, children }) {
    const link = normalizeContentHref(href);
    if (!link) return <>{children}</>;
    if (link.external) {
      return <a href={link.href} target="_blank" rel="noopener noreferrer nofollow ugc">{children}</a>;
    }
    const kind = node?.properties["data-bx-reference"];
    const name = node?.properties["data-bx-name"];
    if (kind === "user" && typeof name === "string") {
      const legacy = node?.properties["data-bx-legacy"] === "true";
      return (
        <UserHoverCard username={name}>
          <Link href={link.href} className="ref-chip ref-chip-user" title={legacy ? `Legacy reference → f/${name}` : `Open f/${name}`}>
            {children}
          </Link>
        </UserHoverCard>
      );
    }
    if (kind === "space" && typeof name === "string") {
      return <Link href={link.href} className="ref-chip ref-chip-space" title={`Open b/${name}`}>{children}</Link>;
    }
    return <Link href={link.href}>{children}</Link>;
  },
};

/** Thread bodies share the editor's CommonMark format; replies and lead briefs keep their renderer. */
export function ThreadBody({ source }: { source: string }) {
  return (
    <div className="prose-bx thread-body">
      <Markdown
        components={components}
        remarkPlugins={[remarkBorynxLinks]}
        urlTransform={markdownUrlTransform}
        skipHtml
        disallowedElements={["img"]}
      >
        {source}
      </Markdown>
    </div>
  );
}
