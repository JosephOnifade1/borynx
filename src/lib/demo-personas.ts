/** Fictional test identities. Never use these handles or sessions outside demo mode. */
export const DEMO_PERSONAS = [
  { username: "demo-buyer", displayName: "Demo Buyer", headline: "Posts a fictional brief", avatarHue: 24, role: "member" },
  { username: "demo-bidder-a", displayName: "Demo Bidder A", headline: "Submits the first test pitch", avatarHue: 192, role: "member" },
  { username: "demo-bidder-b", displayName: "Demo Bidder B", headline: "Submits a competing test pitch", avatarHue: 263, role: "member" },
  { username: "demo-reviewer", displayName: "Demo Reviewer", headline: "Reviews submissions as a site moderator", avatarHue: 45, role: "moderator" },
  { username: "demo-observer", displayName: "Demo Observer", headline: "Checks what an unrelated user can see", avatarHue: 142, role: "member" },
] as const;

export const DEMO_HANDLES = DEMO_PERSONAS.map((persona) => persona.username);
export const isDemoHandle = (username: string) => DEMO_HANDLES.some((handle) => handle === username);
