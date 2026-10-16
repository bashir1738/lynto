import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pino", "pino-pretty", "lokijs", "encoding"],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
      lokijs: false,
      encoding: false,
    };
    return config;
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
