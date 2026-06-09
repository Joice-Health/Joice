import shared from '@joice/config/eslint';

/**
 * Web lints with the shared monorepo flat config. We intentionally avoid the
 * eslint-config-next FlatCompat layer, which currently throws a circular-structure
 * error under ESLint 9.39; type-checking + `next build` already cover Next-specific
 * correctness.
 */
const config = [...shared, { ignores: ['.next', 'node_modules', 'next-env.d.ts'] }];

export default config;
