/**
 * The brain: retrieval-augmented answering over the clinical notes, plus the
 * voice and configuration around it.
 *
 * Server-side entry point — pulls in Postgres and the AWS SDK. Browsers must
 * import `@joice/brain/schemas` instead.
 *
 * Layout mirrors what the domain actually does:
 *
 *   config/       admin-managed behavior (persona, guardrails, model)
 *   knowledge/    the notes: chunking and retrieval
 *   conversation/ history assembly and citation handling
 *   generation/   prompt construction and answering
 *   voice/        speech in and out
 *   providers/    Bedrock clients — the swap seam for model vendors
 *   ports/        what the brain needs from the rest of the platform
 *
 * `providers/` and `ports/` are the two boundaries worth defending: the first
 * is where a compliance review checks that nothing leaves AWS, the second is
 * what keeps this a service instead of a distributed monolith.
 */

export * from './schemas';

export * from './config/service';
export * from './knowledge/chunker';
export * from './generation/prompt';
export * from './generation/answer-service';
export * from './providers/bedrock';
export * from './voice';
export * from './ports';
