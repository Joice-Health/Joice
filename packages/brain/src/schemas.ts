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
  chatActionSchema,
  citationSchema,
  peptideRecommendationSchema,
  HANDOFF_REASONS,
  INTENT_KINDS,
  type ChatAction,
  type ChatMessage,
  type ChatRequest,
  type Citation,
  type PeptideRecommendation,
} from './conversation/schemas';

export {
  alternatesFromUser,
  buildChatHistory,
  MAX_HISTORY_TURNS,
  MAX_MESSAGE_CHARS,
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
  CARE_AREAS,
  CAPTURE_FIELDS,
  GOAL_UNSURE,
  GOAL_VALUES,
  captureInputSchema,
  captureStepSchema,
  companionProfileSchema,
  companionCopySchema,
  companionStateSchema,
  companionActionSchema,
  companionActionResultSchema,
  isValidEmail,
  matchCareArea,
  type CaptureField,
  type CaptureInput,
  type CaptureStep,
  type CompanionProfile,
  type CompanionCopy,
  type CompanionState,
  type CompanionAction,
  type CompanionActionResult,
} from './profile/schemas';

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
