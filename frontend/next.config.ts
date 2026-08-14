import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // next/image refuses to optimise images from hosts you haven't listed —
    // otherwise anyone could point your server at any URL to resize. The seeded
    // listing photos all come from Unsplash.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },

  // Single-service deploy: the browser only ever talks to this Next server, and
  // /api/* is forwarded to uvicorn on loopback inside the same container. Same
  // origin, so there is no CORS in production. Works in `next dev` too, which is
  // why lib/api.ts can use "/api" everywhere client-side.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
