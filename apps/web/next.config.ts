import type { NextConfig } from 'next';
import { join } from 'path';

const nextConfig: NextConfig = {
  // Containerized deploy: emit a minimal standalone server bundle.
  output: 'standalone',
  // Trace workspace deps from the monorepo root so the standalone bundle is complete.
  outputFileTracingRoot: join(import.meta.dirname, '../../'),
  // Compile workspace packages from source (no prebuilt dist step needed).
  transpilePackages: ['@joice/ui', '@joice/api-client', '@joice/core', '@joice/utils'],
  reactStrictMode: true,
};

export default nextConfig;
