export const SIGNAL_WINDOW_DAYS = 90;
export const SIGNAL_SAMPLE_SIZE = 200;
export const RAPID_COMPLETION_HOURS = 24;
const MAX_SUGGESTIONS = 20;
const MIN_SIMILARITY = 0.8;

export type AwardForSignals = {
  leadId: number;
  buyerId: number;
  winnerId: number;
  buyer: string;
  winner: string;
  awardedAt: Date | null;
  completedAt: Date | null;
  review: { id: number; testimonial: string } | null;
};

type Signal =
  | { kind: "rapid_completion" }
  | { kind: "reciprocal_award"; relatedLeadId: number }
  | { kind: "similar_testimonial"; relatedLeadId: number; relatedReviewId: number };

export type LeadReviewSignalMatch = Pick<AwardForSignals, "leadId" | "buyer" | "winner"> & {
  reviewId: number | null;
  signals: Signal[];
};

function fingerprint(text: string) {
  const normalized = text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, " ").trim();
  // Ignore short, often generic compliments. Overlapping triples catch light edits without
  // treating every reuse of a word (or word order) as an identical testimonial.
  if (normalized.length < 50) return null;
  const triples = new Set<string>();
  for (let i = 0; i + 2 < normalized.length; i++) triples.add(normalized.slice(i, i + 3));
  return triples;
}

function similar(a: Set<string>, b: Set<string>) {
  const [smaller, larger] = a.size < b.size ? [a, b] : [b, a];
  if (smaller.size < larger.size * MIN_SIMILARITY) return false;
  let shared = 0;
  for (const triple of smaller) if (larger.has(triple)) shared++;
  return shared / (a.size + b.size - shared) >= MIN_SIMILARITY;
}

/** Input is a newest-first sample of canonical public awards. Nothing here changes moderation state. */
export function findLeadReviewSignals(rows: readonly AwardForSignals[]): LeadReviewSignalMatch[] {
  const sample = rows.slice(0, SIGNAL_SAMPLE_SIZE).map((row) => ({ ...row, fingerprint: row.review ? fingerprint(row.review.testimonial) : null }));
  const matches: LeadReviewSignalMatch[] = [];
  for (const [index, row] of sample.entries()) {
    const signals: Signal[] = [];
    if (row.awardedAt && row.completedAt) {
      const elapsed = row.completedAt.getTime() - row.awardedAt.getTime();
      if (elapsed >= 0 && elapsed <= RAPID_COMPLETION_HOURS * 3_600_000) signals.push({ kind: "rapid_completion" });
    }
    // Compare with older rows so a pair doesn't also appear in reverse on the same screen.
    const older = sample.slice(index + 1);
    const reciprocal = older.find((other) => other.buyerId === row.winnerId && other.winnerId === row.buyerId);
    if (reciprocal) signals.push({ kind: "reciprocal_award", relatedLeadId: reciprocal.leadId });
    const triples = row.fingerprint;
    const duplicate = triples && older.find((other) => (other.buyerId === row.buyerId || other.winnerId === row.winnerId) &&
      other.fingerprint && similar(triples, other.fingerprint));
    if (duplicate && duplicate.review) signals.push({ kind: "similar_testimonial", relatedLeadId: duplicate.leadId, relatedReviewId: duplicate.review.id });
    if (signals.length > 0) matches.push({ leadId: row.leadId, buyer: row.buyer, winner: row.winner, reviewId: row.review?.id ?? null, signals });
    if (matches.length >= MAX_SUGGESTIONS) break;
  }
  return matches;
}
