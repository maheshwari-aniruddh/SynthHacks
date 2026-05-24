import type { NextConfig } from "next";

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'plus.unsplash.com' },
    ],
  },
  async rewrites() {
    return [
      // All FastAPI API endpoints
      {
        source: '/api/:path*',
        destination: `${BACKEND}/:path*`,
      },
      // FastAPI static files (heatmaps, segmentation masks, etc.)
      {
        source: '/static/:path*',
        destination: `${BACKEND}/static/:path*`,
      },
    ];
  },
};

export default nextConfig;
