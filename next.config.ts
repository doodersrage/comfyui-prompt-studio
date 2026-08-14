import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

const baseConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1'],
  env: {
    NEXT_PUBLIC_PROMPT_NSFW_GENERATOR_ENABLED:
      process.env.NEXT_PUBLIC_PROMPT_NSFW_GENERATOR_ENABLED ??
      process.env.PROMPT_NSFW_GENERATOR_ENABLED ??
      '',
  },

  // Keep local Python engine envs and dynamic filesystem ops out of NFT / Turbopack traces.
  outputFileTracingExcludes: {
    '*': [
      './services/**/.venv/**',
      './services/diffusers-engine/.venv/**',
      './src/lib/comfyui-view-cache.ts',
    ],
  },

  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '47832',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '47832',
        pathname: '/**',
      },
    ],
    // Optimize image loading
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  experimental: {
    optimizePackageImports: ['@tanstack/react-virtual', '@xyflow/react'],
    serverActions: {
      bodySizeLimit: '32mb',
    },
    optimizeCss: true,
  },
  serverExternalPackages: ['onnxruntime-web', 'onnxruntime-node', '@huggingface/transformers'],

  async redirects() {
    return [
      {
        source: '/duo',
        destination: '/character?mode=duo',
        permanent: true,
      },
      {
        source: '/random-scene',
        destination: '/?source=random',
        permanent: true,
      },
    ];
  },

  // Add service worker configuration
  async rewrites() {
    return [
      {
        source: '/sw.js',
        destination: '/service-worker.js',
      },
    ];
  },
};

// Skip @next/bundle-analyzer wrapper entirely when ANALYZE is off — saves build-time.
// When enabled, wrap with the standard plugin (openAnalyzer: false = silent mode).
const _isAnalyzing = process.env.ANALYZE === 'true';
export default (_isAnalyzing
  ? bundleAnalyzer({ ...baseConfig, openAnalyzer: true })
  : baseConfig) as NextConfig;
