import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Static export served from S3 + CloudFront (ARCHITECTURE §5). No server-side data access in
 * Next.js: every tenant read goes through the API so there is one RLS-protected path (ADR-001 R1).
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: "export",
  reactStrictMode: true,
  outputFileTracingRoot: join(dirname(fileURLToPath(import.meta.url)), "..", ".."),
  transpilePackages: ["@pacific2/tokens", "@pacific2/money", "@pacific2/contracts"],
};

export default nextConfig;
