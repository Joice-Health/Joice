/**
 * Platform domain: the waitlist and the admin console that runs it.
 *
 * The chatbot used to live here too. It's now `@joice/brain`, which owns its
 * own persistence, providers and ports — see that package's index for why.
 * Nothing in here should import from the brain except the admin surface that
 * edits its settings.
 */
export * from './schemas';
export * from './waitlist-service';
export * from './marketing';
export * from './admin';
export * from './profile/profile-service';
export * from './profile/profile-view';
export * from './profile/lab-uploads-service';
export * from './onboarding/admin-schemas';
export * from './onboarding/marketing-port';
export * from './onboarding/session-store';
export * from './onboarding/flow-service';
export * from './onboarding/onboarding-service';
export * from './onboarding/onboarding-config-service';
export * from './onboarding/service-area-service';
export * from './onboarding/service-area-request-service';
export * from './onboarding/events-service';
export * from './protocols/protocol-rules-service';
