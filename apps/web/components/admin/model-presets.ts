/**
 * The model choices the admin surfaces offer, shared by the brain settings
 * page and the eval console's run panel so the two lists can never drift.
 *
 * Preset ids must be REAL Bedrock inference-profile ids, copied from the
 * model's AWS model card or `aws bedrock list-inference-profiles`, never
 * guessed. The shape changed between generations: older profiles are dated
 * with a version suffix (`us.anthropic.claude-sonnet-4-5-20250929-v1:0`),
 * newer ones are not (`us.anthropic.claude-sonnet-5`). An id that fails with
 * "model does not exist" can also mean the account's Anthropic use-case form
 * is not approved yet; see docs/rag/08-troubleshooting.md.
 */
export const MODEL_PRESETS = [
  { value: 'us.amazon.nova-pro-v1:0', label: 'Amazon Nova Pro' },
  { value: 'us.anthropic.claude-sonnet-5', label: 'Claude Sonnet 5' },
] as const;
