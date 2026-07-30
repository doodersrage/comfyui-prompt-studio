import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
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

  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "47832",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "47832",
        pathname: "/**",
      },
    ],
  },
  experimental: {
    optimizePackageImports: [
      "@tanstack/react-virtual",
      "@xyflow/react",
    ],
    serverActions: {
      bodySizeLimit: "32mb",
    },
    // Performance improvements for large applications
    optimizeCss: true,
  },
  // Add performance-related settings
  productionBrowserSourceMaps: false,

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
