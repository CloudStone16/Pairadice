import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages read live MySQL data per request (and the dev-user cookie), so we use
  // classic dynamic rendering rather than Cache Components.
  cacheComponents: false,
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
