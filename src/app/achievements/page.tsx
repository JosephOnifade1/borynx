import { Lock } from "lucide-react";
import { redirect } from "next/navigation";
import { VerifyForm } from "@/components/forms";
import { PageFrame, PageHeader, Widget } from "@/components/PageFrame";
import { BadgeChip, BadgeIcon, VerifiedMark } from "@/components/primitives";
import { getCurrentUser, getDemoAccountMode } from "@/lib/auth";
import { BADGE_DEFINITIONS, badgeProgress } from "@/lib/badges";
import { evaluateBadges, getUserBadges, loadBadgeStats } from "@/lib/services";
import { routes, timeAgo } from "@/lib/utils";

export const metadata = { title: "Achievements" };

const CATEGORY_LABEL = { identity: "Identity & trust", milestone: "Milestones", marketplace: "Marketplace", community: "Community" } as const;

export default async function AchievementsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`${routes.login()}?next=${routes.achievements()}`);
  const demo = (await getDemoAccountMode()) !== "disabled";
  // Re-evaluate on view so anything earned out-of-band (e.g. karma threshold crossed) is granted.
  await evaluateBadges(user.id);
  const [stats, earned] = await Promise.all([loadBadgeStats(user.id), getUserBadges(user.id)]);
  const earnedMap = new Map(earned.map((b) => [b.slug, b]));
  const unlocked = BADGE_DEFINITIONS.filter((d) => earnedMap.has(d.slug)).length;
  const overall = Math.round((unlocked / BADGE_DEFINITIONS.length) * 100);
  const categories = Object.keys(CATEGORY_LABEL) as Array<keyof typeof CATEGORY_LABEL>;

  return (
    <PageFrame wide
      header={
        <PageHeader
          eyebrow="Achievements"
          title={
            <>
              {unlocked} <span className="text-ink-3">/ {BADGE_DEFINITIONS.length} unlocked</span>
            </>
          }
          description={
            <>
              <div className="mt-1 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full bg-ember transition-all" style={{ width: `${overall}%` }} />
              </div>
              <p className="num mt-1 text-[11.5px] text-ink-3">{overall}% complete · badges are re-evaluated automatically after posts, solutions, votes and joins.</p>
            </>
          }
        />
      }
      aside={
        <>
          <Widget title="Verified Pro">
            {user.isVerified ? (
              <div className="flex items-center gap-2 text-[13px]">
                <VerifiedMark size={18} />
                <span>
                  You&apos;re verified.
                  <span className="block text-[11.5px] text-ink-3">{user.githubUrl}</span>
                </span>
              </div>
            ) : (
              <>
                <p className="mb-3 text-[12.5px] text-ink-2">Email sign-in does not verify professional credentials. Ask a moderator about manual verification.</p>
                {demo && <VerifyForm githubUrl={user.githubUrl} portfolioUrl={user.portfolioUrl} />}
              </>
            )}
          </Widget>
          <Widget title="Your numbers">
            <dl className="num grid grid-cols-2 gap-1.5 text-[12px]">
              {(
                [
                  ["karma", stats.karma],
                  ["threads", stats.posts],
                  ["5+ vote threads", stats.engaged_posts],
                  ["solutions", stats.solutions],
                  ["comments", stats.comments],
                  ["leads", stats.leads],
                  ["spaces", stats.memberships],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between rounded bg-sunken px-2 py-1">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </Widget>
        </>
      }
    >
      {categories.map((cat) => {
        const defs = BADGE_DEFINITIONS.filter((d) => d.category === cat);
        return (
          <section key={cat} aria-labelledby={`cat-${cat}`}>
            <h2 id={`cat-${cat}`} className="eyebrow hairline-b px-4 py-2.5">
              {CATEGORY_LABEL[cat]}
            </h2>
            <ul>
              {defs.map((d) => {
                const prog = badgeProgress(d, stats);
                const got = earnedMap.get(d.slug);
                return (
                  <li key={d.slug} className="ledger-row grid grid-cols-[44px_1fr_auto] items-center gap-4 px-4 py-4">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-md border ${got ? (d.tier === 3 ? "border-gold bg-gold-soft text-gold" : d.tier === 2 ? "border-verdigris bg-verdigris-soft text-verdigris" : "border-line-strong bg-sunken text-ink") : "border-dashed border-line-strong text-ink-4"}`}>
                      {got ? <BadgeIcon icon={d.icon} size={20} /> : <Lock size={16} />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14.5px] font-semibold">{d.name}</span>
                        <BadgeChip icon={d.icon} name={`tier ${d.tier}`} tier={d.tier} locked={!got} />
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-ink-2">{d.description}</p>
                      {!got && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1 w-48 overflow-hidden rounded-full bg-sunken">
                            <div className="h-full rounded-full bg-verdigris" style={{ width: `${prog.pct}%` }} />
                          </div>
                          <span className="num text-[11px] text-ink-3">
                            {Math.min(prog.current, d.threshold)} / {d.threshold}
                          </span>
                        </div>
                      )}
                    </div>
                    <span className="num text-right text-[11px] text-ink-3">{got ? `earned ${timeAgo(got.earnedAt)} ago` : `${prog.pct}%`}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </PageFrame>
  );
}
