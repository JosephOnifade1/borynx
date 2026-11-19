import type { NextConfig } from "next";
import { existingDemoAccountsRequested, isDemoMode } from "./src/lib/demo-mode";

const nextConfig: NextConfig = {
  // The provider adds a one-use PKCE exchange code to the callback query. Never log it.
  logging: { incomingRequests: { ignore: [/^\/api\/auth\/callback(?:\?|$)/] } },
  async headers() {
    return ["/l/new", "/login", "/me/lead-services", "/mod/queue", "/api/auth/callback"].map((source) => ({
      source,
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex" },
        { key: "Cache-Control", value: "private, no-store" },
      ],
    }));
  },
  // Allow the development iframe only for the five-persona disposable demo, never for existing accounts.
  ...(isDemoMode() ? { allowedDevOrigins: ["127.0.0.1", ...(existingDemoAccountsRequested() ? [] : ["*.e2b.app"])] } : {}),
};

export default nextConfig;
