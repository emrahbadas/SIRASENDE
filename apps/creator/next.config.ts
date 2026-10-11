import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sirasende/types"],
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Poster uploads go through a server action (posters are capped at 5 MB)
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
