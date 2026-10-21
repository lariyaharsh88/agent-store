import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@anthropic-ai/sdk"],
  async rewrites() {
    return [
      { source: "/.well-known/agent.json", destination: "/api/agent/manifest" },
      { source: "/llms.txt", destination: "/api/llms" },
      { source: "/openapi.json", destination: "/api/openapi" },
    ];
  },
};

export default nextConfig;
