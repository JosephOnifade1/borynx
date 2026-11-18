/**
 * Automated content safety hooks. Runs synchronously pre-submission.
 * Each check contributes to a 0..1 risk score; a score ≥ BLOCK_THRESHOLD rejects the submission,
 * a score ≥ FLAG_THRESHOLD accepts it but files an `automated_filter` report for human review.
 */

export const BLOCK_THRESHOLD = 0.8;
export const FLAG_THRESHOLD = 0.4;

const PROFANITY = ["fuck", "shit", "bitch", "asshole", "bastard", "cunt", "dickhead", "motherfucker"];
const SCAM_PHRASES = [
  "guaranteed income",
  "wire transfer upfront",
  "send a deposit",
  "pay the processing fee",
  "crypto giveaway",
  "double your money",
  "western union",
  "telegram me",
  "whatsapp only",
  "no interview needed",
];
const SUSPICIOUS_TLDS = [".xyz", ".top", ".click", ".work", ".loan", ".win", ".gq", ".tk", ".ml"];
const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "cutt.ly", "rb.gy"];

export interface SafetyFlag {
  code: "profanity" | "link_spam" | "shortener" | "suspicious_domain" | "scam_phrase" | "shouting" | "repetition";
  detail: string;
  weight: number;
}

export interface SafetyVerdict {
  score: number;
  flags: SafetyFlag[];
  allowed: boolean;
  needsReview: boolean;
}

export function extractLinks(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>()]+/gi)].map((m) => m[0]);
}

export function evaluateContent(text: string): SafetyVerdict {
  const flags: SafetyFlag[] = [];
  const lower = text.toLowerCase();

  const profane = PROFANITY.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(lower));
  if (profane.length) flags.push({ code: "profanity", detail: profane.join(", "), weight: 0.35 * Math.min(profane.length, 2) });

  const scams = SCAM_PHRASES.filter((p) => lower.includes(p));
  if (scams.length) flags.push({ code: "scam_phrase", detail: scams.join(", "), weight: 0.45 * Math.min(scams.length, 2) });

  const links = extractLinks(text);
  if (links.length >= 4) flags.push({ code: "link_spam", detail: `${links.length} links`, weight: 0.3 + 0.1 * (links.length - 4) });
  const shorteners = links.filter((l) => SHORTENERS.some((s) => l.includes(s)));
  if (shorteners.length) flags.push({ code: "shortener", detail: shorteners.join(", "), weight: 0.3 });
  const suspicious = links.filter((link) => {
    try {
      const hostname = new URL(link).hostname;
      return SUSPICIOUS_TLDS.some((tld) => hostname.endsWith(tld));
    } catch {
      return false;
    }
  });
  if (suspicious.length) flags.push({ code: "suspicious_domain", detail: suspicious.join(", "), weight: 0.35 });

  const letters = text.replace(/[^a-z]/gi, "");
  if (letters.length > 24) {
    const upper = letters.replace(/[^A-Z]/g, "").length / letters.length;
    if (upper > 0.7) flags.push({ code: "shouting", detail: `${Math.round(upper * 100)}% caps`, weight: 0.25 });
  }

  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length > 12) {
    const unique = new Set(words).size / words.length;
    if (unique < 0.3) flags.push({ code: "repetition", detail: `${Math.round(unique * 100)}% unique words`, weight: 0.3 });
  }

  const score = Math.min(1, flags.reduce((acc, f) => acc + f.weight, 0));
  return { score, flags, allowed: score < BLOCK_THRESHOLD, needsReview: score >= FLAG_THRESHOLD && score < BLOCK_THRESHOLD };
}

/** Rate limit windows per action type. */
export const RATE_LIMITS = {
  post: { max: 3, windowMinutes: 10 },
  comment: { max: 12, windowMinutes: 5 },
  lead: { max: 2, windowMinutes: 15 },
  report: { max: 10, windowMinutes: 10 },
  bid: { max: 6, windowMinutes: 10 },
} as const;

export type RateLimitedAction = keyof typeof RATE_LIMITS;
