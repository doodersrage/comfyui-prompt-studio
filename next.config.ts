import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1'],
  serverExternalPackages: ['nodemailer', 'sharp'],
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
    // Enable performance optimization features
  },
  // Add performance-related settings
  productionBrowserSourceMaps: false,
  
  // Add performance budgets to detect oversized bundles
  webpack(config, { isServer }) {
    // Only apply bundle size limits in production
    if (process.env.NODE_ENV === 'production') {
      config.module.rules.push({
        test: /\.(js|ts|tsx)$/, 
        enforce: 'pre',
        loader: 'webpack-bundle-analyzer/lib/webpack-plugin',
        options: {
          analyzerMode: 'disabled',
          generateStatsFile: true,
          statsFilename: 'stats.json',
        },
      });
    }
    
    // Add code splitting for better bundle optimization
    if (!isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\\\/](node_modules)[\\\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
        },
      };
    }
    
    return config;
  },

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

export default withBundleAnalyzer(nextConfig);
