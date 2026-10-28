import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable ESLint during build to prevent build failures
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Type errors fail the build so they never reach production.
  // (stream-chat-react's react-markdown@8 types are shimmed in types/react-markdown.)
  typescript: {
    ignoreBuildErrors: false,
  },

  // Bundle optimization
  experimental: {
    optimizePackageImports: [
      '@fortawesome/free-solid-svg-icons',
      '@fortawesome/free-brands-svg-icons',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      'date-fns',
      'recharts'
    ],
  },

  // Webpack optimizations
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Suppress specific warnings that don't affect functionality
    config.ignoreWarnings = [
      /Critical dependency: the request of a dependency is an expression/,
      /require function is used in a way in which dependencies cannot be statically extracted/,
    ];

    // Polyfill useEffectEvent for fumadocs in React 19 builds
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^react$/,
        (resource) => {
          if (resource.context && resource.context.includes('fumadocs')) {
            resource.request = path.resolve(process.cwd(), 'lib/react-shim.js');
          }
        }
      )
    );

    // Let Next.js handle splitChunks and tree shaking automatically in App Router
    // Custom splitChunks overrides break module evaluation order and cause TDZ ReferenceErrors in production

    // Let Next.js handle tree shaking optimization automatically
    // Removed manual usedExports and sideEffects to avoid conflicts with Next.js 15

    return config;
  },

  // Compiler optimizations
  compiler: {
    // Remove console logs in production
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Image optimization
  images: {
    formats: ['image/webp', 'image/avif'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'files.tryflowdrive.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.pinimg.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.sanity.io',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '/**',
      },
      // YouTube thumbnails and channel images
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'yt3.ggpht.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'yt3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      // Convex Cloud Storage
      {
        protocol: 'https',
        hostname: '*.convex.cloud',
        port: '',
        pathname: '/api/storage/**',
      },
      // Clerk User Images
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
        port: '',
        pathname: '/**',
      },
    ],
  },

  // Output optimization - removed 'standalone' to fix Vercel deployment symlink issues
  poweredByHeader: false,
  compress: true,

  // Headers for caching
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
      {
        source: '/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // 3D exercise library: encrypted, versioned files (new content = new folder), so the CDN
      // and browsers can keep them forever. Keys come from Convex per viewer.
      {
        source: '/exercise-library/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'X-Robots-Tag', value: 'noindex' },
        ],
      },
      // Library PDF leaflets are shown in a frame inside our own pages (and nowhere else)
      {
        source: '/api/library/doc/:key',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Robots-Tag', value: 'noindex' },
        ],
      },
      {
        source: '/vendor/draco/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }],
      },
      // Exercise links sent on WhatsApp: private, never cached or indexed, token never leaked
      // to other sites through the Referer header. Other sites get our origin only (no path):
      // "no-referrer" broke the YouTube videos on these pages (YouTube error 153).
      {
        source: '/x/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      // Service worker (app install + push): browsers must always fetch the latest copy
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
    ];
  },

  // Physiotherapist pages that were retired or merged (they used to be redirect-only pages)
  async redirects() {
    const physio = '/dashboard/physiotherapist';
    return [
      { source: `${physio}/exercises`, destination: `${physio}/exercise-library`, permanent: true },
      { source: `${physio}/my-exercise-library`, destination: `${physio}/exercise-library`, permanent: true },
      // Treatment templates now live in the care plan: "Save as template" and "Start from a template"
      { source: `${physio}/templates`, destination: `${physio}/patients`, permanent: false },
      { source: `${physio}/treatment-templates/:path*`, destination: `${physio}/patients`, permanent: false },
      { source: `${physio}/treatment-templates`, destination: `${physio}/patients`, permanent: false },
      { source: `${physio}/patients/:patientId/treatment-plan`, destination: `${physio}/patients/:patientId?tab=plan`, permanent: false },
      { source: `${physio}/assessments`, destination: physio, permanent: true },
      { source: `${physio}/patient-progress`, destination: `${physio}/patients`, permanent: true },
      { source: `${physio}/test-reminders`, destination: physio, permanent: true },
      { source: `${physio}/billing/payout-policy`, destination: '/payout-policy', permanent: true },
      { source: `${physio}/settings/notifications`, destination: `${physio}/settings/profile`, permanent: true },
      { source: `${physio}/settings/preferences`, destination: `${physio}/settings/profile`, permanent: true },
      { source: `${physio}/settings/complete-onboarding`, destination: physio, permanent: true },
    ];
  },

  // Rewrites
  async rewrites() {
    return [
      {
        source: '/favicon.ico',
        destination: '/logos/favicon/favicon.ico',
      },
    ]
  },
};

import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

export default withMDX(nextConfig);


