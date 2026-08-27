/**
 * The model choices the admin surfaces offer, shared by the brain settings
 * page and the eval console's run panel so the two lists can never drift.
 *
 * Preset ids must be REAL Bedrock inference-profile ids: dated, with the
 * version suffix. Confirm what the account can see with
 * `aws bedrock list-inference-profiles` before adding one; a plausible-looking
 * undated id ("us.anthropic.claude-sonnet-5") fails at invoke time.
 */
export const MODEL_PRESETS = [
  { value: 'us.amazon.nova-pro-v1:0', label: 'Amazon Nova Pro' },
  { value: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', label: 'Claude Sonnet 4.5' },
] as const;
