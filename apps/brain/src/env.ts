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
  RAG_MODEL: z.string().default('us.anthropic.claude-sonnet-4-5-20250929-v1:0'),
  BEDROCK_REGION: z.string().default('us-east-1'),
  /** Polly voice for spoken answers — must be generative-capable. */
  POLLY_VOICE_ID: z.string().default('Ruth'),
  /**
   * Store chat threads in Postgres.
   *
   * OFF by default, deliberately. A stored question about a symptom is health
   * information tied to a person, which crosses the Phase-0 "marketing data
   * only" line — the retention policy and the Before-PHI checklist have to be
   * settled before this is switched on for real members. The code path is
   * built and tested so that turning it on is a config change, not a project.
   * See docs/rag/07-compliance.md.
   */
  BRAIN_PERSIST_CONVERSATIONS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * Klaviyo, for syncing companion leads (name/email/goal — marketing-grade,
   * same class as the waitlist's data, but a completely separate funnel).
   * Optional: absent locally, capture still works and simply doesn't sync.
   */
  KLAVIYO_API_KEY: z.string().optional(),
  /**
   * Recognise a signed-in member when the browser sends a Clerk bearer token
   * (the companion claim on sign-up; member context later). Verification is
   * networkless with the instance's JWT public key (Clerk Dashboard -> API
   * keys -> JWT public key, PEM), so this service never holds the Clerk
   * secret: the brain task cannot touch Clerk's API by design (infra/iam.tf).
   * CLERK_SECRET_KEY is accepted only as a local-dev fallback when no JWT key
   * is set. With neither, every token fails verification and the requester
   * stays anonymous; nothing else changes.
   */
  CLERK_JWT_KEY: z.string().default(''),
  CLERK_PUBLISHABLE_KEY: z.string().default('pk_test_placeholder'),
  CLERK_SECRET_KEY: z.string().default(''),
  /** Git SHA of the image, baked in at build time and reported by /health. */
  BUILD_SHA: z.string().default('dev'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = envSchema.parse(process.env);

export const allowedOrigins = env.WEB_ORIGIN.split(',').map((o) => o.trim());
