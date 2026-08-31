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
   * CarePortals commerce: a dedicated CRM service-user (CarePortals issues
   * no static admin key; the org credential IS a CRM login) plus the org id
   * already used by the public storefront. All three empty (the default)
   * disables subscription lookups: members simply never resolve to the
   * subscriber tier. Fail-closed by design.
   */
  CAREPORTALS_ORG: z.string().default(''),
  CAREPORTALS_CRM_USERNAME: z.string().default(''),
  CAREPORTALS_CRM_PASSWORD: z.string().default(''),
  /**
   * RAG chatbot model id — on this service it is ONLY the display default the
   * admin console (/api/admin/brain) resolves settings against. All actual
   * model traffic runs on the brain service under the brain task role; the
   * api task role has NO Bedrock permissions (deliberately removed when the
   * brain became its own service — see infra/iam.tf).
   */
  RAG_MODEL: z.string().default('us.anthropic.claude-sonnet-4-5-20250929-v1:0'),
  BEDROCK_REGION: z.string().default('us-east-1'),
  /** Polly voice for spoken answers — must be generative-capable. */
  POLLY_VOICE_ID: z.string().default('Ruth'),
  /**
   * Onboarding retention: an in-progress session idle this long becomes
   * abandoned; an unclaimed session untouched for the TTL loses its answers,
   * observations and profile (the sweep script). Registered sessions never
   * expire. Numbers confirmed by counsel (brief, section 9).
   */
  ONBOARDING_SESSION_IDLE_DAYS: z.coerce.number().int().min(1).default(30),
  ONBOARDING_SESSION_TTL_DAYS: z.coerce.number().int().min(1).default(90),
  /**
   * PHI key 1 of 2. Set by Terraform after the Before-PHI checklist, never by
   * an admin. With the onboarding_health flag it lets a flow version that asks
   * health-tier traits be published; off, the validator refuses them.
   */
  PHI_READY: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  /**
   * Bearer token for /api/internal/* (the brain reading a member's profile
   * and writing observations). Shared with the brain task by Terraform
   * (random_password in infra/secrets.tf); empty makes the routes answer 503.
   */
  INTERNAL_API_TOKEN: z.string().default(''),
  /**
   * The PHI labs bucket (infra/labs.tf). Empty disables the member labs
   * surface entirely; the routes then answer 404 like any other locked door.
   * The SDK resolves the region from the task's own AWS_REGION.
   */
  LABS_BUCKET: z.string().default(''),
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
