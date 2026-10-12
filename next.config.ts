import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: [
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
    "@smithy/core",
    "puppeteer-core",
    "pdf-lib",
    "mongoose",
    "ioredis",
    "bullmq",
    "bcryptjs"
  ],
  eslint: {
    ignoreDuringBuilds: true
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "26mb"
    }
  },
  typescript: {
    ignoreBuildErrors: true
  },
  webpack: (config) => {
    config.resolve.modules.push(path.resolve(__dirname, 'node_modules'));
    if (process.env.DOCKER_ENV) {
      config.watchOptions = {
        poll: 2500,
        aggregateTimeout: 500,
        ignored: ['**/node_modules/**', '**/.next/**', '**/worker/**', '**/scratch/**', '**/scripts/**'],
      };
    }
    return config;
  }
};

export default nextConfig;