import app from './app';
import { env } from './env';

const server = Bun.serve({
  fetch: app.fetch,
  port: env.PORT,
});

console.log(`🚀 Joice API listening on http://localhost:${server.port}`);

export type { AppType } from './app';
