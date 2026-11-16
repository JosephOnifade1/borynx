/**
 * Borynx feed ranking mathematics.
 *
 * Three paradigms were evaluated:
 *  - Hacker News gravity  (points / (age+2)^1.8)  → punishes older, high-vote posts too hard for a
 *    low-volume professional network where a great thread can live for days.
 *  - Reddit "hot"         (sign·log10|s| + t/45000) → logarithmic vote scaling (first 10 votes = next 100)
 *    with a linear time-decay term. Stable, cheap, and composable. Chosen as the base for TRENDING,
 *    extended with a discussion-velocity term so comment-heavy threads surface even without votes.
 *  - Wilson lower bound   → sample-size-aware confidence for TOP so a 3/0 post can't outrank 180/12.
 */

export type RankMode = "hot" | "top" | "new";

export interface Rankable {
  upvotes: number;
  downvotes: number;
  commentCount?: number;
  createdAt: Date | string | number;
}

/** Hours it takes for a post to lose one order of magnitude (10×) of vote weight. */
export const HOT_DECAY_HOURS = 12.5;
/** Weight applied to log-scaled comment velocity. */
export const DISCUSSION_WEIGHT = 0.45;

const toMillis = (d: Date | string | number): number =>
  d instanceof Date ? d.getTime() : typeof d === "number" ? d : new Date(d).getTime();

export function netScore(item: Pick<Rankable, "upvotes" | "downvotes">): number {
  return item.upvotes - item.downvotes;
}

/**
 * Trending score. Higher is hotter.
 *  score = sign(s)·log10(max(|s|,1)) + w·log10(1 + comments) − ageHours / DECAY
 */
export function hotScore(item: Rankable, now: number = Date.now()): number {
  const s = netScore(item);
  const order = Math.log10(Math.max(Math.abs(s), 1));
  const sign = s > 0 ? 1 : s < 0 ? -1 : 0;
  const discussion = DISCUSSION_WEIGHT * Math.log10(1 + Math.max(item.commentCount ?? 0, 0));
  const ageHours = Math.max(0, (now - toMillis(item.createdAt)) / 3_600_000);
  return sign * order + discussion - ageHours / HOT_DECAY_HOURS;
}

/**
 * Lower bound of the Wilson score confidence interval for a Bernoulli parameter.
 * z = 1.96 → 95% confidence. Returns 0 for zero samples.
 */
export function wilsonLowerBound(upvotes: number, downvotes: number, z: number = 1.96): number {
  const n = upvotes + downvotes;
  if (n <= 0) return 0;
  const phat = upvotes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n);
  return Math.max(0, (centre - margin) / denominator);
}

export function topScore(item: Rankable): number {
  return wilsonLowerBound(item.upvotes, item.downvotes);
}

export function newScore(item: Rankable): number {
  return toMillis(item.createdAt);
}

export function scoreFor(mode: RankMode, item: Rankable, now: number = Date.now()): number {
  switch (mode) {
    case "hot":
      return hotScore(item, now);
    case "top":
      return topScore(item);
    case "new":
      return newScore(item);
  }
}

/** Stable sort by mode, descending. Ties fall back to recency, then upvotes. */
export function rankItems<T extends Rankable>(items: readonly T[], mode: RankMode, now: number = Date.now()): T[] {
  return items
    .map((item, index) => ({ item, index, score: scoreFor(mode, item, now) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const recency = newScore(b.item) - newScore(a.item);
      if (recency !== 0) return recency;
      if (b.item.upvotes !== a.item.upvotes) return b.item.upvotes - a.item.upvotes;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

export function isRankMode(value: unknown): value is RankMode {
  return value === "hot" || value === "top" || value === "new";
}

export const RANK_MODES: ReadonlyArray<{ id: RankMode; label: string; hint: string }> = [
  { id: "hot", label: "Hot", hint: "log-votes · time decay" },
  { id: "top", label: "Best", hint: "Wilson 95% lower bound" },
  { id: "new", label: "New", hint: "chronological" },
];
