import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["nodemailer", "sharp"],
  // Keep local Python engine envs and dynamic filesystem ops out of NFT / Turbopack traces.
  outputFileTracingExcludes: {
    "*": [
      "./services/**/.venv/**",
      "./services/diffusers-engine/.venv/**",
      "./src/lib/comfyui-view-cache.ts",
    ],
  },
  // Compose/Refine figure uploads (compressed) + occasional JSON data-URL fallback.
  experimental: {
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
  async redirects() {
    return [
      {
        source: "/duo",
        destination: "/character?mode=duo",
        permanent: true,
      },
      {
        source: "/random-scene",
        destination: "/?source=random",
        permanent: true,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
