/**
 * The database schema, split by the domain that owns each table.
 *
 * One Postgres, one migration stream — this split is about ownership, not
 * deployment. It exists so that "which service is allowed to write this table?"
 * is answerable by looking at a file name, now that the brain runs as its own
 * service against the same database.
 *
 * The rule: a service may write only the tables in its own file. The brain
 * touches `brain.ts` and nothing else; if it needs something from another
 * domain it asks through a port (see `@joice/brain` ports/). `onboarding.ts`
 * (the intake flow and the member profile) belongs to @joice/core on the api.
 */
export * from './waitlist';
export * from './identity';
export * from './platform';
export * from './brain';
export * from './onboarding';
