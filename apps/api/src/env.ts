import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Comma-separated list of allowed browser origins for CORS. */
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  /** Salt mixed into IP hashes so we never persist raw addresses. */
  IP_HASH_SALT: z.string().default('joice-dev-salt'),
  /**
   * How many trailing `X-Forwarded-For` hops our own infrastructure appends —
   * CloudFront (viewer) then the ALB (CloudFront's edge) = 2 in production.
   * Rate limiting counts from the right using this; see middleware/rate-limit.ts.
   * 0 locally, where there is no proxy and the socket address is the truth.
   */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  /**
   * Clerk keys — verify admin session tokens on /api/admin/*. Placeholder
   * defaults keep the API bootable before Clerk is configured; every admin
   * request just fails verification (401) until real keys are set.
   */
  CLERK_SECRET_KEY: z.string().default('sk_test_placeholder'),
  CLERK_PUBLISHABLE_KEY: z.string().default('pk_test_placeholder'),
  /**
   * Klaviyo waitlist marketing sync. Both empty (the default) disables the
   * sync entirely — signups still work, they just don't reach Klaviyo.
   * The list ID is the 6-char code in the Klaviyo list URL; not a secret.
   */
  KLAVIYO_API_KEY: z.string().default(''),
  KLAVIYO_LIST_ID: z.string().default(''),
  /**
   * RAG chatbot — everything runs through Bedrock (AWS BAA; IAM-authenticated
   * via the ECS task role, no API keys). Locally, requests fail with 500 until
   * AWS creds with Bedrock access are present; the rest of the API still works.
   */
  RAG_MODEL: z.string().default('us.anthropic.claude-sonnet-4-5-20250929-v1:0'),
  BEDROCK_REGION: z.string().default('us-east-1'),
  /** Polly voice for spoken answers — must be generative-capable. */
  POLLY_VOICE_ID: z.string().default('Ruth'),
  /**
   * Git SHA of the image, baked in at build time and reported by /health.
   * "dev" locally, where the running code is whatever is bind-mounted.
   */
  BUILD_SHA: z.string().default('dev'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = envSchema
  .refine((e) => !e.KLAVIYO_API_KEY === !e.KLAVIYO_LIST_ID, {
    message:
      'KLAVIYO_API_KEY and KLAVIYO_LIST_ID must be set together (or both left empty to disable the sync) — half-configured would silently sync nothing.',
  })
  .parse(process.env);

export const allowedOrigins = env.WEB_ORIGIN.split(',').map((o) => o.trim());
