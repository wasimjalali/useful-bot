import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Root `tsc --noEmit` is the type gate. Next's in-app tsc looks for
  // typescript under web/ and fails this monorepo layout.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
