import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["nodemailer", "sharp"],
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
        source: "/compose",
        destination: "/character?mode=compose",
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
