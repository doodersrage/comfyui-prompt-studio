import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
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

export default nextConfig;
