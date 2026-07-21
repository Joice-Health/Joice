/**
 * Browser-safe entry point — `@joice/brain/schemas`.
 *
 * The web app must import from here, never from the barrel: `./index.ts` pulls
 * in the Postgres driver and the AWS SDK, which breaks the client build. Same
 * rule as `@joice/core/schemas`; the split exists for the same reason.
 *
 * Everything re-exported below is pure wire contracts and pure functions.
 */

export {
  chatMessageSchema,
  chatRequestSchema,
  citationSchema,
  peptideRecommendationSchema,
  type ChatMessage,
  type ChatRequest,
  type Citation,
  type PeptideRecommendation,
} from './conversation/schemas';

export {
  alternatesFromUser,
  buildChatHistory,
  MAX_HISTORY_TURNS,
  type HistoryMessage,
} from './conversation/history';

export { citedIndexes, stripCitationMarkers } from './conversation/citations';

export { speakRequestSchema, type SpeakRequest } from './voice/schemas';

export {
  conversationIdParamSchema,
  storedConversationSchema,
  type StoredConversationView,
} from './conversation/wire';

export {
  brainSettingsSchema,
  brainSettingsPatchSchema,
  brainUiSchema,
  BRAIN_UI_DEFAULTS,
  DEFAULT_BRAIN_SETTINGS,
  type BrainSettings,
  type BrainSettingsPatch,
  type BrainUi,
  type ResolvedBrainConfig,
} from './config/schemas';

export type {
  AuditPort,
  BrainPorts,
  CatalogItem,
  CatalogPort,
  CartPort,
  MemberContext,
  MemberContextPort,
  MemberOrder,
  MemberProtocol,
  Requester,
  SettingsActor,
} from './ports';
