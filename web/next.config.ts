import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages read live MySQL data per request (and the dev-user cookie), so we use
  // classic dynamic rendering rather than Cache Components.
  cacheComponents: false,
  // forbidden() renders app/forbidden.tsx (experimental in Next 16.4, opt-in).
  experimental: { authInterrupts: true },
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
