import { ArrowRight, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { PostFeed } from "@/components/feed/PostFeed";
import { PageFrame } from "@/components/PageFrame";
import { getCurrentUser } from "@/lib/auth";
import { listPosts } from "@/lib/queries";
import { isRankMode, type RankMode } from "@/lib/sorting";
import { cn, routes } from "@/lib/utils";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; feed?: string }>;
}) {
  const user = await getCurrentUser();
  const { sort, feed: feedParam } = await searchParams;
  const isFollowingFeed = feedParam === "following" && Boolean(user);
  const mode: RankMode = isRankMode(sort) ? sort : "hot";

  const initialPage = await listPosts({
    mode,
    followingUserId: isFollowingFeed && user ? user.id : undefined,
    viewer: user,
  });

  return (
    <PageFrame
      stream
      header={
        !user ? (
          <section className="panel relative overflow-hidden rounded-lg px-5 py-7 sm:px-6">
            <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, var(--ember), transparent 65%)" }} />
            <div className="relative">
              <p className="eyebrow">Engineering · Design · DevOps · Security · Data · AI · Product</p>
              <h1 className="display mt-3 text-[30px] sm:text-[36px]">
                The working network for tech freelancers who are <span className="text-ember">paid for outcomes.</span>
              </h1>
              <p className="mt-3 max-w-xl text-[14px] text-ink-2">Communities with real practitioners, a lead board across every tech specialty, and a reputation ledger that rewards solved problems.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href={routes.login()} className="btn btn-primary h-9 px-4">
                  Join Borynx <ArrowRight size={14} />
                </Link>
                <Link href={routes.leads()} className="btn h-9 px-4">
                  Browse open leads
                </Link>
              </div>
            </div>
          </section>
        ) : undefined
      }
    >
      {user && (
        <nav aria-label="Feed scope" className="panel mb-3 flex items-center gap-1 rounded-lg px-2">
          <Link
            href={sort ? `/?sort=${sort}` : "/"}
            className={cn(
              "relative flex h-10 items-center gap-1.5 px-3 text-[13px] font-semibold transition-colors",
              !isFollowingFeed ? "text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            <Sparkles size={14} className={!isFollowingFeed ? "text-ember" : "text-ink-3"} />
            <span>All Threads</span>
            {!isFollowingFeed && (
              <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-ember" />
            )}
          </Link>

          <Link
            href={sort ? `/?feed=following&sort=${sort}` : "/?feed=following"}
            className={cn(
              "relative flex h-10 items-center gap-1.5 px-3 text-[13px] font-semibold transition-colors",
              isFollowingFeed ? "text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            <Users size={14} className={isFollowingFeed ? "text-ember" : "text-ink-3"} />
            <span>Following</span>
            {isFollowingFeed && (
              <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-ember" />
            )}
          </Link>
        </nav>
      )}

      <PostFeed
        key={isFollowingFeed ? "following-feed" : "all-feed"}
        composer={!isFollowingFeed}
        showSpace
        following={isFollowingFeed}
        initialMode={mode}
        initialPage={initialPage}
        emptyTitle={isFollowingFeed ? "Your following feed is quiet" : "The feed is quiet"}
        emptyHint={
          isFollowingFeed
            ? "Follow freelancers on their profiles or in threads to see their posts here."
            : "Start a thread in any community."
        }
      />
    </PageFrame>
  );
}
