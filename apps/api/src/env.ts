import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Comma-separated list of allowed browser origins for CORS. */
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  /** Salt mixed into IP hashes so we never persist raw addresses. */
  IP_HASH_SALT: z.string().default('joice-dev-salt'),
  /**
   * Clerk keys — verify admin session tokens on /api/admin/*. Placeholder
   * defaults keep the API bootable before Clerk is configured; every admin
   * request just fails verification (401) until real keys are set.
   */
  CLERK_SECRET_KEY: z.string().default('sk_test_placeholder'),
  CLERK_PUBLISHABLE_KEY: z.string().default('pk_test_placeholder'),
  /**
   * RAG chatbot — everything runs through Bedrock (AWS BAA; IAM-authenticated
   * via the ECS task role, no API keys). Locally, requests fail with 500 until
   * AWS creds with Bedrock access are present; the rest of the API still works.
   */
  RAG_MODEL: z.string().default('us.anthropic.claude-sonnet-5'),
  BEDROCK_REGION: z.string().default('us-east-1'),
  /** Polly neural voice for spoken answers. */
  POLLY_VOICE_ID: z.string().default('Ruth'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = envSchema.parse(process.env);

export const allowedOrigins = env.WEB_ORIGIN.split(',').map((o) => o.trim());
