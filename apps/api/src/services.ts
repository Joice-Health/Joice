import { getDatabase } from '@joice/db';
import {
  createAdminWaitlistService,
  createAuditService,
  createEmbeddingClient,
  createFeatureFlagService,
  createGenerationClient,
  createRecommendationService,
  createSettingsService,
  createSpeechClient,
  createTranscribeClient,
  createUserService,
  createWaitlistService,
} from '@joice/core';
import { env } from './env';

/** Single service graph over the shared DB client, reused across routes. */
const db = getDatabase();

export const waitlist = createWaitlistService(db);
export const audit = createAuditService(db);
export const adminWaitlist = createAdminWaitlistService(db, audit);
export const userService = createUserService(db, audit);
export const featureFlags = createFeatureFlagService(db, audit);
export const settings = createSettingsService(db, audit);

export const recommendations = createRecommendationService(db, {
  embeddings: createEmbeddingClient({ region: env.BEDROCK_REGION }),
  generation: createGenerationClient({ region: env.BEDROCK_REGION }),
  model: env.RAG_MODEL,
});

export const transcriber = createTranscribeClient({ region: env.BEDROCK_REGION });
export const speech = createSpeechClient({
  region: env.BEDROCK_REGION,
  voiceId: env.POLLY_VOICE_ID,
});
