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
  // The storefront landing moved from /home to the site root (sc-251). The
  // certification shelf later moved from /shop to /store (sc-263) with no
  // redirects: nobody held storefront links yet (Shaun, 2026-09-01), and the
  // /shop namespace belongs to the real shop.
  async redirects() {
    return [{ source: '/home', destination: '/', permanent: true }];
  },
};

export default nextConfig;
