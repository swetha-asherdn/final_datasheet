import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  eslint: {
    ignoreDuringBuilds: true
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "26mb"
    }
  },
  webpack: (config) => {
    config.resolve.modules.push(path.resolve(__dirname, 'node_modules'));
    return config;
  }
};

export default nextConfig;