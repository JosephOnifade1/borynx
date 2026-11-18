import type { DemoAccountMode } from "./demo-mode";

/** Fictional test identities. Never use these handles or sessions outside demo mode. */
export const DEMO_PERSONAS = [
  { username: "demo-buyer", displayName: "Demo Buyer", headline: "Posts a fictional brief", avatarHue: 24, role: "member" },
  { username: "demo-bidder-a", displayName: "Demo Bidder A", headline: "Submits the first test pitch", avatarHue: 192, role: "member" },
  { username: "demo-bidder-b", displayName: "Demo Bidder B", headline: "Submits a competing test pitch", avatarHue: 263, role: "member" },
  { username: "demo-reviewer", displayName: "Demo Reviewer", headline: "Reviews submissions as a site moderator", avatarHue: 45, role: "moderator" },
  { username: "demo-observer", displayName: "Demo Observer", headline: "Checks what an unrelated user can see", avatarHue: 142, role: "member" },
] as const;

export const DEMO_HANDLES = DEMO_PERSONAS.map((persona) => persona.username);

/** Match the canonical handles in the database, accepting a typed f/ or u/ prefix. */
export function normalizeDemoHandle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().toLowerCase().replace(/^[fu]\//, "");
  return /^[a-z0-9][a-z0-9_.-]{1,31}$/.test(username) ? username : null;
}

export function isDemoAccountAllowed(mode: DemoAccountMode, username: string): boolean {
  return mode !== "disabled" && normalizeDemoHandle(username) === username &&
    (mode === "existing" || DEMO_HANDLES.some((handle) => handle === username));
}
