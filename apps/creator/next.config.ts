import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sirasende/types"],
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Poster uploads go through a server action (posters are capped at 4 MB;
  // Vercel rejects request bodies over 4.5 MB)
  experimental: {
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default nextConfig;
