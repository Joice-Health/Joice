import { createBunWebSocket } from 'hono/bun';

/**
 * `upgradeWebSocket` (used by the route) and `websocket` (handed to Bun.serve)
 * must come from the same factory call, so they live here and are imported by
 * both app.ts and index.ts.
 */
export const { upgradeWebSocket, websocket } = createBunWebSocket();
