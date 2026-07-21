import { getDatabase } from '@joice/db';
import {
  createBrainConfigService,
  createEmbeddingClient,
  createGenerationClient,
  createRecommendationService,
  createSpeechClient,
  createTranscribeClient,
  noopAuditPort,
  stubPorts,
} from '@joice/brain';
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
 * Member context, catalogue and cart. Stubs today — no commerce or member
 * accounts exist yet. When they do, these become HTTP clients to the api
 * service and only this line changes.
 */
export const ports = stubPorts;
