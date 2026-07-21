import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { streamSSE } from 'hono/streaming';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  chatRequestSchema,
  createTranscribeSession,
  joinWaitlistSchema,
  referralCodeParamSchema,
  speakRequestSchema,
  type TranscribeSession,
} from '@joice/core';
import { allowedOrigins, env } from './env';
import { upgradeWebSocket } from './ws';
import { rateLimit, clientIp } from './middleware/rate-limit';
import { hashIp } from './hash';
import { brainConfig, featureFlags, recommendations, speech, transcriber, waitlist } from './services';
import { adminRoutes } from './admin/routes';

const app = new Hono();

app.use('*', logger());
app.use('*', secureHeaders());
app.use(
  '/api/*',
  cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error('Unhandled error:', err);
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
});

/**
 * Live voice transcription. Audio streams up as it is spoken and partial
 * transcripts stream back, so the text appears while the member is still
 * talking — the batch POST /api/voice/transcribe below stays as the fallback
 * for browsers or networks where the socket can't open.
 *
 * Deliberately NOT part of the typed route chain: it is never called through
 * the RPC client, and an upgrade handler has no place in AppType.
 *
 * Wire protocol — client → server: binary frames of 16kHz mono PCM16, then
 * `{"type":"end"}`. Server → client: `{"type":"partial"|"final","text":…}`
 * and finally `{"type":"done"}`.
 */
app.get('/api/voice/stream', rateLimit({ windowMs: 60_000, max: 20 }), upgradeWebSocket(() => {
  let session: TranscribeSession | null = null;
  let pump: Promise<void> | null = null;

  return {
    onOpen(_event, ws) {
      session = createTranscribeSession({ region: env.BEDROCK_REGION });
      pump = (async () => {
        try {
          for await (const result of session!.results) {
            ws.send(
              JSON.stringify({ type: result.isPartial ? 'partial' : 'final', text: result.text }),
            );
          }
          ws.send(JSON.stringify({ type: 'done' }));
        } catch (error) {
          console.error('voice stream error:', error);
          ws.send(JSON.stringify({ type: 'error' }));
        }
      })();
    },

    onMessage(event, ws) {
      const data = event.data;
      if (typeof data === 'string') {
        // Only control messages arrive as text.
        if (data.includes('"end"')) session?.end();
        return;
      }
      if (data instanceof ArrayBuffer) {
        session?.write(new Uint8Array(data));
      } else if (ArrayBuffer.isView(data)) {
        session?.write(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      }
      void ws;
    },

    onClose() {
      session?.end();
      session = null;
      void pump;
    },
  };
}));

/**
 * Routes are defined in a single chain so `typeof routes` carries the full
 * request/response shape — that's what @joice/api-client consumes via Hono RPC.
 * `/stats` is registered before `/:code` so it isn't swallowed by the param route.
 */
const routes = app
  .get('/health', (c) => c.json({ ok: true as const }))
  .post(
    '/api/waitlist',
    rateLimit({ windowMs: 60_000, max: 10 }),
    zValidator('json', joinWaitlistSchema),
    async (c) => {
      const { email, firstName, lastName, ref } = c.req.valid('json');
      const ipHash = await hashIp(clientIp(c));
      const entry = await waitlist.join({ email, firstName, lastName, ref, ipHash });
      return c.json(entry, 201);
    },
  )
  .get('/api/waitlist/stats', async (c) => {
    return c.json(await waitlist.getStats());
  })
  .get(
    '/api/waitlist/:code',
    zValidator('param', referralCodeParamSchema),
    async (c) => {
      const { code } = c.req.valid('param');
      const entry = await waitlist.getByCode(code);
      if (!entry) return c.json({ error: 'Referral code not found' }, 404);
      return c.json(entry);
    },
  )
  // Runtime feature flags for both apps; served from a ~30s in-memory cache.
  .get('/api/flags', rateLimit({ windowMs: 60_000, max: 60 }), async (c) => {
    return c.json(await featureFlags.evaluateAll());
  })
  // Public-safe slice of the admin-managed brain config (/ask copy + citation
  // visibility). Same ~30s cache; never exposes the system prompt or guardrails.
  .get('/api/brain', rateLimit({ windowMs: 60_000, max: 60 }), async (c) => {
    const config = await brainConfig.get();
    return c.json({
      emptyStateHint: config.emptyStateHint,
      inputPlaceholder: config.inputPlaceholder,
      disclaimer: config.disclaimer,
      showCitations: config.showCitations,
    });
  })
  // RAG chatbot. Public pre-launch but tightly rate-limited — every request
  // costs Bedrock tokens. Non-streaming JSON variant keeps the typed-client
  // flow; /stream is the chat-UI path (SSE isn't consumable via hc hooks).
  .post(
    '/api/peptide-recommendations',
    rateLimit({ windowMs: 60_000, max: 5 }),
    zValidator('json', chatRequestSchema),
    async (c) => {
      const { messages } = c.req.valid('json');
      return c.json(await recommendations.recommend(messages));
    },
  )
  .post(
    '/api/peptide-recommendations/stream',
    rateLimit({ windowMs: 60_000, max: 5 }),
    zValidator('json', chatRequestSchema),
    async (c) => {
      const { messages } = c.req.valid('json');
      return streamSSE(c, async (stream) => {
        try {
          for await (const event of recommendations.recommendStream(messages)) {
            if (event.type === 'delta') {
              await stream.writeSSE({ event: 'delta', data: JSON.stringify({ text: event.text }) });
            } else {
              await stream.writeSSE({ event: 'complete', data: JSON.stringify(event.recommendation) });
            }
          }
        } catch (err) {
          console.error('RAG stream error:', err);
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ error: 'Something went wrong. Please try again.' }),
          });
        }
      });
    },
  )
  // Voice: speech→text and text→speech via Transcribe/Polly (AWS BAA — audio is
  // processed in memory only, never persisted or logged). Rate-limited: both
  // endpoints cost per invocation.
  .post('/api/voice/transcribe', rateLimit({ windowMs: 60_000, max: 10 }), async (c) => {
    // Raw 16kHz mono PCM16 from the browser recorder — ~2MB ≈ 60s hard cap.
    const audio = await c.req.arrayBuffer();
    if (audio.byteLength === 0) return c.json({ error: 'Empty audio' }, 400);
    if (audio.byteLength > 2 * 1024 * 1024) return c.json({ error: 'Recording too long' }, 413);
    const transcript = await transcriber.transcribe(new Uint8Array(audio));
    return c.json({ transcript });
  })
  .post(
    '/api/voice/speak',
    rateLimit({ windowMs: 60_000, max: 10 }),
    zValidator('json', speakRequestSchema),
    async (c) => {
      const { text } = c.req.valid('json');
      const spoken = text.replace(/\[\d+\]/g, '').replace(/\s{2,}/g, ' ').trim();
      const audio = await speech.synthesize(spoken);
      c.header('Content-Type', 'audio/mpeg');
      return c.body(audio.buffer as ArrayBuffer);
    },
  )
  .route('/api/admin', adminRoutes);

export type AppType = typeof routes;
// `routes` is the same instance as `app`, but typed with the full route chain.
export default routes;
