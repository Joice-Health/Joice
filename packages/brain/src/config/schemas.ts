import { z } from 'zod';

/**
 * Brain settings and the public slice of them.
 *
 * Browser-safe: no AWS or Postgres imports. The admin console (on the api
 * service) edits these; the brain service reads them. Both validate against
 * this one schema, which is why it lives with the domain that owns the
 * behavior rather than with the admin plumbing that happens to edit it.
 */

/* ------------------------------------------------------------------------- *
 * Brain settings — admin-managed chatbot behavior. Stored as ONE partial
 * app_settings row (key `brain`); anything unset falls back to code defaults,
 * so a stale or invalid row can never break chat. The safety floor (grounding,
 * not-medical-advice) is NOT here — it lives in code (prompt.ts) and cannot be
 * disabled from the admin.
 * ------------------------------------------------------------------------- */

export const brainSettingsSchema = z.object({
  /** Who the assistant is. */
  personaName: z.string().trim().min(1).max(60),
  personaDescription: z.string().trim().min(1).max(1000),
  toneInstructions: z.string().trim().max(2000),
  /** `natural` = talk like a person; never mention notes/documents/sources. */
  attributionStyle: z.enum(['cite-notes', 'natural']),
  /** Controls both the [n]-marker instruction and the UI chips. */
  showCitations: z.boolean(),

  /** Copy. */
  notCoveredMessage: z.string().trim().min(1).max(1000),
  clinicianHandoffMessage: z.string().trim().min(1).max(500),
  emptyStateHint: z.string().trim().min(1).max(300),
  inputPlaceholder: z.string().trim().min(1).max(200),
  disclaimer: z.string().trim().min(1).max(200),

  /** Guardrails (on top of the code-level safety floor). */
  restrictedTopics: z.array(z.string().trim().min(1).max(200)).max(20),
  customInstructions: z.string().trim().max(4000),

  /**
   * Pre-onboarding companion copy — the words the capture flow says. Flat
   * fields (not a nested object) because `resolve()` is a shallow merge; a
   * nested object would be replaced wholesale by any partial write. Detection
   * and validation are code; only the copy is admin-editable.
   */
  /** The woven intro shown when capture begins, after the first real answer. */
  companionGreeting: z.string().trim().min(1).max(400),
  companionNamePrompt: z.string().trim().min(1).max(200),
  companionEmailPrompt: z.string().trim().min(1).max(200),
  companionGoalPrompt: z.string().trim().min(1).max(200),
  companionConversionPrompt: z.string().trim().min(1).max(400),
  companionConversionCtaLabel: z.string().trim().min(1).max(60),

  /** Retrieval & generation. */
  topK: z.number().int().min(1).max(20),
  similarityFloor: z.number().min(0).max(1),
  maxAnswerTokens: z.number().int().min(128).max(4096),
  /**
   * Tool-calling answers: the model decides when to search the notes or the
   * catalogue instead of the fixed retrieve-then-answer pipeline. OFF runs the
   * classic path byte-for-byte — this flag is the rollback switch (a settings
   * change, not a deploy).
   */
  toolsEnabled: z.boolean(),
  /** Max tool-execution rounds per answer — each round is an extra model call. */
  maxToolRounds: z.number().int().min(1).max(5),
  /**
   * Bedrock prompt caching (cachePoint after the static system prompt + tool
   * definitions). Off by default: it only pays once the static prefix crosses
   * the model's minimum cacheable size (~1K tokens — which the tool
   * definitions push it toward), and support varies by model. Models that
   * reject cachePoint degrade to uncached automatically, so the worst case of
   * turning this on is one failed request per model per process. Verify it's
   * actually working via cacheReadInputTokens in the usage counts.
   */
  promptCache: z.boolean(),
  /** Rewrite follow-up questions into standalone search queries using the conversation. */
  queryRewriting: z.boolean(),
  /** Small/fast Bedrock model used for the rewrite. */
  rewriteModel: z.string().trim().min(1).max(200),

  /** Runtime-switchable model/voice; unset = env defaults (RAG_MODEL / POLLY_VOICE_ID). */
  model: z.string().trim().min(1).max(200),
  pollyVoiceId: z.string().trim().min(1).max(50),
});

export type BrainSettings = z.infer<typeof brainSettingsSchema>;

/** What's stored / PUT — any subset of the fields. */
export const brainSettingsPatchSchema = brainSettingsSchema.partial();
export type BrainSettingsPatch = z.infer<typeof brainSettingsPatchSchema>;

/** Everything resolved (stored ?? default ?? env) — what the chat runtime consumes. */
export type ResolvedBrainConfig = BrainSettings;

/** Code defaults = today's behavior. Model/voice defaults come from env at resolve time. */
export const DEFAULT_BRAIN_SETTINGS: Omit<BrainSettings, 'model' | 'pollyVoiceId'> = {
  personaName: 'Joice',
  personaDescription:
    "Joice's peptide knowledge assistant, answering members' questions about peptides and protocols",
  toneInstructions: 'Be specific and practical; use plain language and keep answers focused. Never use em dashes.',
  attributionStyle: 'cite-notes',
  showCitations: true,
  notCoveredMessage:
    "I don't have information about that in our clinical reference notes, so I can't " +
    'give you a grounded answer. Try rephrasing, or ask about a specific peptide or ' +
    'protocol we cover.',
  clinicianHandoffMessage:
    'Our clinical team handles that during consultation.',
  emptyStateHint: 'Ask about any peptide or protocol in our clinical research library.',
  inputPlaceholder: 'e.g. What does the clinical team say about BPC-157 dosing?',
  disclaimer: 'Educational information from our clinical notes, not medical advice',
  restrictedTopics: [],
  customInstructions: '',
  companionGreeting:
    "Love that you're digging into this. So I can tailor what I share: mind if I grab a " +
    'couple of quick things?',
  companionNamePrompt: 'First up, what should I call you?',
  companionEmailPrompt: "What's the best email to reach you? I'll use it to save your progress.",
  companionGoalPrompt: 'What brings you here today?',
  companionConversionPrompt:
    "Whenever you're ready, I can help you start your journey: a few quick questions and " +
    'our clinical team takes it from there.',
  companionConversionCtaLabel: 'Start my journey',
  topK: 8,
  similarityFloor: 0.4,
  maxAnswerTokens: 1024,
  toolsEnabled: false,
  maxToolRounds: 3,
  promptCache: false,
  queryRewriting: true,
  rewriteModel: 'us.amazon.nova-lite-v1:0',
};

/**
 * Public-safe slice of the settings above, served by GET /api/brain/config and
 * consumed by the /ask page (copy + citation-chip visibility). Deliberately
 * narrow: the system prompt, guardrails and model choice never reach a browser.
 */
export const brainUiSchema = z.object({
  emptyStateHint: z.string(),
  inputPlaceholder: z.string(),
  disclaimer: z.string(),
  showCitations: z.boolean(),
  /** Server-side thread persistence is on (env-derived, not admin-set). */
  historyEnabled: z.boolean(),
});

export type BrainUi = z.infer<typeof brainUiSchema>;

/**
 * Client-side fallbacks while GET /api/brain/config loads. Derived from
 * DEFAULT_BRAIN_SETTINGS rather than retyped — they drifted apart when they
 * were two hand-maintained literals.
 */
export const BRAIN_UI_DEFAULTS: BrainUi = {
  emptyStateHint: DEFAULT_BRAIN_SETTINGS.emptyStateHint,
  inputPlaceholder: DEFAULT_BRAIN_SETTINGS.inputPlaceholder,
  disclaimer: DEFAULT_BRAIN_SETTINGS.disclaimer,
  showCitations: DEFAULT_BRAIN_SETTINGS.showCitations,
  // Conservative while loading: never offer resume the server can't serve.
  historyEnabled: false,
};
