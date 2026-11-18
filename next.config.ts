import type { NextConfig } from "next";
import { isDemoMode } from "./src/lib/demo-mode";

const nextConfig: NextConfig = {
  // Allow Arena's development iframe to load the disposable demo app. Production is unaffected.
  ...(isDemoMode() ? { allowedDevOrigins: ["127.0.0.1", "*.e2b.app"] } : {}),
};

export default nextConfig;
