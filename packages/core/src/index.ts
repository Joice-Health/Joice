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
export * from './admin';
