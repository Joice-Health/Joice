import { z } from 'zod';

/**
 * Environment for the brain service. Validated at import time — add variables
 * here rather than reading `process.env` in a handler, so a misconfigured
 * deployment fails at boot instead of on the first member's question.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(4100),
  /** Comma-separated browser origins allowed for CORS and the voice WebSocket. */
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  /**
   * How many trailing `X-Forwarded-For` hops our own infrastructure appends —
   * CloudFront (viewer) then the ALB = 2 in production. Rate limiting counts
   * from the right using this; see middleware/client-ip.ts for why the leftmost
   * hop must never be trusted. 0 locally, where the socket address is the truth.
   */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  /**
   * Everything runs through Bedrock (AWS BAA; IAM-authenticated via the ECS
   * task role, no API keys). Locally these fail with 500 until AWS credentials
   * with Bedrock access are present.
   */
  RAG_MODEL: z.string().default('us.anthropic.claude-sonnet-5'),
  BEDROCK_REGION: z.string().default('us-east-1'),
  /** Polly neural voice for spoken answers. */
  POLLY_VOICE_ID: z.string().default('Ruth'),
  /** Git SHA of the image, baked in at build time and reported by /health. */
  BUILD_SHA: z.string().default('dev'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = envSchema.parse(process.env);

export const allowedOrigins = env.WEB_ORIGIN.split(',').map((o) => o.trim());
