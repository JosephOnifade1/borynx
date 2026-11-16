"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { routes } from "@/lib/utils";
import { cn } from "@/lib/utils";

const items = [
  { href: routes.home(), label: "Front page", match: (p: string) => p === "/" },
  { href: routes.spaces(), label: "Spaces", match: (p: string) => p.startsWith("/b") },
  { href: routes.leads(), label: "Leads", match: (p: string) => p.startsWith("/l") },
  { href: routes.achievements(), label: "Achievements", match: (p: string) => p.startsWith("/achievements") },
  { href: "/status", label: "Status", match: (p: string) => p === "/status" },
];

/** Compact horizontal nav for viewports where the sidebar is hidden. */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="hairline-b flex gap-1 overflow-x-auto px-3 py-2 lg:hidden">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.match(pathname) ? "page" : undefined} className={cn("nav-item h-8 shrink-0 text-[12.5px]")}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
