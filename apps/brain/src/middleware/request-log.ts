import type { MiddlewareHandler } from 'hono';

/**
 * One JSON line per request, carrying the request id.
 *
 * Replaces `hono/logger`, whose two-line human format has no request id and so
 * can't be tied to the error a member reports. JSON parses natively in
 * CloudWatch Logs Insights, so `filter reqId = "..."` finds every line for one
 * request.
 *
 * Deliberately never logs bodies or query strings — request bodies here are
 * member questions, which are health information. Paths only.
 */
export const requestLog: MiddlewareHandler = async (c, next) => {
  const startedAt = performance.now();
  await next();
  // For SSE and WebSockets this is time-to-first-byte, not total duration —
  // the response object resolves as soon as streaming begins.
  const ms = Math.round(performance.now() - startedAt);
  console.log(
    JSON.stringify({
      reqId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms,
    }),
  );
};
