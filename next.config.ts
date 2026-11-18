import type { NextConfig } from "next";
import { existingDemoAccountsRequested, isDemoMode } from "./src/lib/demo-mode";

const nextConfig: NextConfig = {
  // Allow the development iframe only for the five-persona disposable demo, never for existing accounts.
  ...(isDemoMode() ? { allowedDevOrigins: ["127.0.0.1", ...(existingDemoAccountsRequested() ? [] : ["*.e2b.app"])] } : {}),
};

export default nextConfig;
