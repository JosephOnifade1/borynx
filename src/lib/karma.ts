import type { PostKind } from "@/db/schema";

/**
 * Reputation multipliers.
 *  - Discussion / showcase posts earn base karma per net upvote.
 *  - Resource & help posts (the content that actually moves a vertical forward) earn 1.5×.
 *  - A comment accepted as the solution earns a flat 10× bonus.
 */
export const BASE_VOTE_KARMA = 1;
export const SOLUTION_BASE_KARMA = 5;

export const KIND_MULTIPLIER: Record<PostKind, number> = {
  discussion: 1,
  showcase: 1,
  resource: 1.5,
  help: 1.5,
};

export const SOLUTION_MULTIPLIER = 10;

export type KarmaReason =
  | "post_upvote"
  | "post_downvote"
  | "comment_upvote"
  | "comment_downvote"
  | "lead_upvote"
  | "solution_accepted"
  | "solution_revoked"
  | "lead_bid_accepted"
  | "moderation_penalty";

export function karmaForLeadWon(): KarmaComputation {
  return {
    base: 50,
    multiplier: 1,
    amount: 50,
    reason: "lead_bid_accepted",
  };
}

export interface KarmaComputation {
  base: number;
  multiplier: number;
  amount: number;
  reason: KarmaReason;
}

/** Karma delta for a vote on a post of a given kind. `voteDelta` is the change in net score (-2..2). */
export function karmaForPostVote(kind: PostKind, voteDelta: number): KarmaComputation {
  const multiplier = KIND_MULTIPLIER[kind] ?? 1;
  const base = BASE_VOTE_KARMA * voteDelta;
  return {
    base,
    multiplier,
    amount: Math.round(base * multiplier),
    reason: voteDelta >= 0 ? "post_upvote" : "post_downvote",
  };
}

export function karmaForCommentVote(voteDelta: number): KarmaComputation {
  const base = BASE_VOTE_KARMA * voteDelta;
  return { base, multiplier: 1, amount: base, reason: voteDelta >= 0 ? "comment_upvote" : "comment_downvote" };
}

export function karmaForLeadVote(voteDelta: number): KarmaComputation {
  const base = BASE_VOTE_KARMA * voteDelta;
  return { base, multiplier: 1, amount: base, reason: "lead_upvote" };
}

/** Flat award (or revocation) when a comment is marked as the accepted solution. */
export function karmaForSolution(revoked: boolean = false): KarmaComputation {
  const base = revoked ? -SOLUTION_BASE_KARMA : SOLUTION_BASE_KARMA;
  return {
    base,
    multiplier: SOLUTION_MULTIPLIER,
    amount: base * SOLUTION_MULTIPLIER,
    reason: revoked ? "solution_revoked" : "solution_accepted",
  };
}

/** Multiplier stored as integer percent (150 = 1.5×) to avoid float drift in Postgres. */
export function multiplierToPercent(multiplier: number): number {
  return Math.round(multiplier * 100);
}
