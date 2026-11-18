export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function slugify(input: string, max: number = 72): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "") || "untitled";
}

export function timeAgo(input: Date | string | number, now: number = Date.now()): string {
  const t = input instanceof Date ? input.getTime() : typeof input === "number" ? input : new Date(input).getTime();
  const diff = Math.max(0, now - t) / 1000;
  if (diff < 45) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d`;
  if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))}mo`;
  return `${Math.floor(diff / (86400 * 365))}y`;
}

export function formatCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

export function formatBudget(min: number, max: number, currency: string, unit?: "fixed" | "hourly" | null): string {
  const fmt = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
  const suffix = unit === "hourly" ? " / hr" : "";
  if (min && max && min !== max) return `${fmt(min)} – ${fmt(max)}${suffix}`;
  if (max) return `${fmt(max)}${suffix}`;
  if (min) return `from ${fmt(min)}${suffix}`;
  return "Negotiable";
}

/* ---------------- Canonical routes ---------------- */

export const routes = {
  home: () => "/",
  spaces: () => "/b",
  spaceNew: () => "/b/new",
  space: (slug: string) => `/b/${slug}`,
  spaceSubmit: (slug: string) => `/b/${slug}/submit`,
  spaceMod: (slug: string) => `/b/${slug}/mod`,
  post: (spaceSlug: string, id: number, slug: string) => `/b/${spaceSlug}/p/${id}/${slug}`,
  postShort: (id: number) => `/p/${id}`,
  postEdit: (id: number) => `/p/${id}/edit`,
  profile: (username: string) => `/f/${username}`,
  profileProjects: (username: string) => `/f/${username}?tab=projects`,
  me: () => "/me",
  leads: () => "/l",
  leadNew: () => "/l/new",
  lead: (id: number, slug: string) => `/l/${id}/${slug}`,
  leadSubmission: (id: number) => `/l/${id}`,
  modQueue: () => "/mod/queue",
  leaderboard: () => "/leaderboard",
  notifications: () => "/notifications",
  saved: () => "/saved",
  savedLeads: () => "/saved?tab=leads",
  settings: () => "/settings",
  settingsProjects: () => "/settings/projects",
  achievements: () => "/achievements",
  login: () => "/login",
} as const;

/* ---------------- Share attribution ---------------- */

export function generateShareId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const bytes = new Uint8Array(10);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function buildShareUrl(path: string, refUserId: number | null, origin: string, shareId: string = generateShareId()): string {
  const url = new URL(path, origin);
  if (refUserId) url.searchParams.set("ref_id", String(refUserId));
  url.searchParams.set("share_id", shareId);
  return url.toString();
}
