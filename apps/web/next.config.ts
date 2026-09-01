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
  // The storefront landing moved from /home to the site root (sc-251); links
  // already in the wild (auditors got URLs directly) keep working forever.
  // The certification shelf then moved from /shop to /store (sc-263) so the
  // real shop could take the clean routes: the deep legacy shapes (the bespoke
  // Glutathione page and the 24-hex generic PDP) can never collide with the
  // new shop's /shop/[category], so they redirect unconditionally for every
  // visitor. Deliberately permanent: false, because a cached 308 would freeze
  // the /shop namespace in browsers. Exact /shop and /checkout are the real
  // shop and get their cookie-aware forward in middleware.ts instead.
  async redirects() {
    return [
      { source: '/home', destination: '/', permanent: true },
      { source: '/shop/glutathione', destination: '/store/glutathione', permanent: false },
      { source: '/shop/:id([0-9a-f]{24})', destination: '/store/:id', permanent: false },
    ];
  },
};

export default nextConfig;
