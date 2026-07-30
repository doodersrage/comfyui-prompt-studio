/**
 * Performance optimization configurations for Next.js application
 */

// Webpack optimization settings
export const webpackConfig = {
  // Enable advanced tree shaking
  optimization: {
    usedExports: true,
    sideEffects: false,
    minimize: true,
    minimizer: [
      // Add terser plugin for minification
      '...',
    ],
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        default: {
          minChunks: 2,
          priority: -20,
          reuseExistingChunk: true,
        },
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: -10,
          chunks: 'all',
        },
      },
    },
  },
};

// Next.js image optimization settings
export const imageOptimization = {
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  loader: 'default',
  dangerouslyAllowSVG: false,
  contentDispositionType: 'inline',
};

// CSS optimization settings
export const cssOptimization = {
  // Enable CSS optimization in experimental mode
  optimizeCss: true,
  // Enable font optimization
  optimizeFonts: true,
};

// Build optimization settings
export const buildOptimization = {
  // Enable production browser source maps (disabled for performance)
  productionBrowserSourceMaps: false,
  // Enable bundle analysis in development
  analyze: process.env.ANALYZE === 'true',
};