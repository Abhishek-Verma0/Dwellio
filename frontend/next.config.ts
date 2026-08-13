import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // next/image refuses to optimise images from hosts you haven't listed —
    // otherwise anyone could point your server at any URL to resize. The seeded
    // listing photos all come from Unsplash.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};

export default nextConfig;
