import { getDatabase } from '@joice/db';
import {
  createBrainConfigService,
  createConversationService,
  createEmbeddingClient,
  createGenerationClient,
  createProfileService,
  createRecommendationService,
  createSpeechClient,
  createTranscribeClient,
  noopAuditPort,
  noopLeadSyncPort,
  stubPorts,
  type LeadSyncPort,
} from '@joice/brain';
import { createKlaviyoClient } from '@joice/marketing';
import { env } from './env';

/** Single service graph over the shared DB client, reused across routes. */
const db = getDatabase();

/**
 * Admin-managed chatbot behavior. This service only ever *reads* the settings
 * — the admin console on the api service owns writes, which is why the audit
 * port is a no-op here: there is no admin actor on this side to attribute a
 * change to. See packages/brain ports/ for the interface.
 */
export const brainConfig = createBrainConfigService(db, noopAuditPort, {
  envDefaults: { model: env.RAG_MODEL, pollyVoiceId: env.POLLY_VOICE_ID },
});

export const recommendations = createRecommendationService(db, {
  embeddings: createEmbeddingClient({ region: env.BEDROCK_REGION }),
  generation: createGenerationClient({ region: env.BEDROCK_REGION }),
  getConfig: brainConfig.get,
});

export const transcriber = createTranscribeClient({ region: env.BEDROCK_REGION });
export const speech = createSpeechClient({
  region: env.BEDROCK_REGION,
  getVoiceId: async () => (await brainConfig.get()).pollyVoiceId,
});

/**
 * Chat-thread persistence. The service is always constructed — it's the
 * `persistConversations` flag, not the presence of the service, that decides
 * whether anything is written, so the read paths stay available for whatever
 * history already exists.
 */
export const conversationService = createConversationService(db);

/** Whether to record threads at all. Off unless explicitly enabled — see env.ts. */
export const persistConversations = env.BRAIN_PERSIST_CONVERSATIONS;

/**
 * Companion → Klaviyo, and nothing else. Profile import only — never a list
 * subscription: the visitor gave an email to personalize the conversation,
 * not marketing consent. The waitlist is a separate funnel this port must
 * never touch; Klaviyo deduping profiles by email is the only place the two
 * ever meet.
 */
const leadSync: LeadSyncPort = env.KLAVIYO_API_KEY
  ? (() => {
      const klaviyo = createKlaviyoClient({ apiKey: env.KLAVIYO_API_KEY });
      return {
        async upsertLead(lead) {
          await klaviyo.importProfile({
            email: lead.email,
            // Deliberately no first_name: Klaviyo's top-level fields are
            // last-writer-wins, and a chat-collected name must never clobber a
            // form-collected one (docs/marketing/01-klaviyo.md namespace
            // policy). The name lives on the lead row and in /admin/leads.
            properties: {
              // lead_* is the brain's property prefix under the same policy.
              lead_source: 'companion',
              lead_status: lead.status,
              ...(lead.goal ? { lead_goal: lead.goal } : {}),
            },
          });
        },
      } satisfies LeadSyncPort;
    })()
  : noopLeadSyncPort;
console.log(`[brain] Klaviyo lead sync: ${env.KLAVIYO_API_KEY ? 'enabled' : 'disabled (no key set)'}`);

/**
 * The pre-onboarding companion's lead capture. Always on: a name + email + goal
 * lead is marketing-grade data, the same class as the waitlist, and is stored
 * unconditionally — it is deliberately NOT gated by the conversation-persistence
 * flag, which governs health-question content only.
 */
export const profileService = createProfileService(db, { leadSync });

/**
 * Member context, catalogue and cart. Stubs today — no commerce or member
 * accounts exist yet. When they do, these become HTTP clients to the api
 * service and only this line changes.
 */
export const ports = stubPorts;
