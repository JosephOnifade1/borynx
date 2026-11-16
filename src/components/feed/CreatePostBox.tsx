"use client";

import { ImagePlus, Link2 } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/components/providers";
import { Avatar } from "@/components/primitives";
import { routes } from "@/lib/utils";

/** Reddit-style creator entry point at the top of every stream. Opens the full composer. */
export function CreatePostBox({ spaceSlug }: { spaceSlug?: string }) {
  const user = useSession();
  const href = spaceSlug ? routes.spaceSubmit(spaceSlug) : routes.spaces();
  const prompt = spaceSlug ? `Start a thread in b/${spaceSlug}…` : "Pick a community to post in…";

  if (!user) {
    return (
      <Link href={routes.login()} className="panel mb-3 flex items-center gap-3 rounded-lg px-4 py-3 text-[13px] text-ink-3 hover:border-line-strong">
        <span className="field flex h-9 flex-1 items-center text-ink-3">Sign in to start a thread…</span>
      </Link>
    );
  }

  return (
    <div className="panel mb-3 flex items-center gap-3 rounded-lg p-3">
      <Avatar hue={user.avatarHue} name={user.displayName} size={32} className="hidden sm:inline-flex" />
      <Link href={href} className="field flex h-9 min-w-0 flex-1 items-center text-[13px] text-ink-3 hover:border-ink-3">
        <span className="truncate">{prompt}</span>
      </Link>
      <Link href={href} className="btn btn-sm" aria-label="New thread" title="New thread">
        <ImagePlus size={14} />
        <span className="hidden md:inline">Thread</span>
      </Link>
      <Link href={routes.leadNew()} className="btn btn-sm" aria-label="Post a lead" title="Post a lead">
        <Link2 size={14} />
        <span className="hidden md:inline">Lead</span>
      </Link>
    </div>
  );
}
