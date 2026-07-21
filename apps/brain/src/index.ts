import app from './app';
import { env } from './env';
import { websocket } from './ws';

const server = Bun.serve({
  fetch: app.fetch,
  websocket, // live voice transcription — see /api/brain/voice/stream in app.ts
  port: env.PORT,
});

console.log(`🧠 Joice brain listening on http://localhost:${server.port}`);

export type { BrainAppType } from './app';
