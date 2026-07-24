import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { requestId, type RequestIdVariables } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { streamSSE } from 'hono/streaming';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import {
  captureStepFor,
  chatRequestSchema,
  companionActionSchema,
  conversationIdParamSchema,
  createTranscribeSession,
  ProfileValidationError,
  speakRequestSchema,
  stripCitationMarkers,
  type ChatMessage,
  type CompanionActionResult,
  type CompanionState,
  type PeptideRecommendation,
  type ResolvedBrainConfig,
  type Requester,
  type TranscribeSession,
} from '@joice/brain';
import type { WSContext } from 'hono/ws';
import { allowedOrigins, env } from './env';
import { upgradeWebSocket } from './ws';
import { rateLimit } from './middleware/rate-limit';
import { requestLog } from './middleware/request-log';
import { identifyRequester, type RequesterVariables } from './middleware/requester';
import { checkHealth } from './health';
import {
  brainConfig,
  conversationService,
  persistConversations,
  profileService,
  recommendations,
  speech,
  transcriber,
} from './services';

const app = new Hono<{ Variables: RequestIdVariables & RequesterVariables }>();

// requestId first — everything downstream, including the logger and the error
// handler, reads the id it sets. It also echoes it as X-Request-Id, so the id
// in a bug report matches the id in CloudWatch.
app.use('*', requestId());
app.use('*', requestLog);
app.use('*', secureHeaders());
// Who is asking. Anonymous today (an opaque session cookie); the seam where
// member auth plugs in — see middleware/requester.ts.
app.use('/api/brain/*', identifyRequester);
app.use(
  '/api/*',
  cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    // The session cookie must survive cross-origin requests in local dev (web
    // :3000 → brain :4100). Requires a specific origin allowlist above, never
    // `*` — which this is.
    credentials: true,
  }),
);

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  const reqId = c.get('requestId');
  console.error(JSON.stringify({ reqId, path: c.req.path, error: String(err) }));
  console.error(err);
  return c.json({ error: 'Something went wrong. Please try again.', reqId }, 500);
});

/**
 * Ceilings for a single voice socket. The recorder stops itself at 60s, so
 * these only bind on a client that ignores the UI — which is exactly the case
 * worth bounding, since every second of audio is billed.
 */
const VOICE_STREAM_MAX_MS = 90_000;
/** 16kHz mono PCM16 = 32,000 bytes/second, so ~90s of audio. */
const VOICE_STREAM_MAX_BYTES = 3_000_000;

/**
 * Live voice transcription. Audio streams up as it is spoken and partial
 * transcripts stream back, so the text appears while the member is still
 * talking — the batch POST /api/brain/voice/transcribe below stays as the
 * fallback for browsers or networks where the socket can't open.
 *
 * Deliberately NOT part of the typed route chain: it is never called through
 * the RPC client, and an upgrade handler has no place in BrainAppType.
 *
 * Wire protocol — client → server: binary frames of 16kHz mono PCM16, then
 * `{"type":"end"}`. Server → client: `{"type":"partial"|"final","text":…}`
 * and finally `{"type":"done"}`.
 */
app.get(
  '/api/brain/voice/stream',
  rateLimit({ windowMs: 60_000, max: 20 }),
  // CORS does not apply to WebSockets, so without this any third-party page
  // could open sockets and bill Transcribe against their visitors' addresses.
  async (c, next) => {
    const origin = c.req.header('origin');
    if (origin && !allowedOrigins.includes(origin)) {
      return c.json({ error: 'Origin not allowed' }, 403);
    }
    return next();
  },
  upgradeWebSocket(() => {
    let session: TranscribeSession | null = null;
    let bytes = 0;
    let deadline: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    /** Release the Transcribe session (and the billing it implies) exactly once. */
    const finish = () => {
      if (deadline) clearTimeout(deadline);
      deadline = null;
      session?.end();
      session = null;
    };

    /**
     * Transcribe keeps emitting for a moment after `end()`, so the result loop
     * can outlive a socket we closed on a cap. Writing to a closed socket is
     * noise at best — drop it.
     */
    const send = (ws: WSContext, payload: unknown) => {
      if (closed) return;
      ws.send(JSON.stringify(payload));
    };

    /** Refuse the session and tell the client why, once. */
    const reject = (ws: WSContext, reason: string) => {
      finish();
      send(ws, { type: 'error', reason });
      closed = true;
      ws.close(1009, reason);
    };

    return {
      onOpen(_event, ws) {
        session = createTranscribeSession({ region: env.BEDROCK_REGION });

        // A socket held open bills Transcribe for as long as it lives, and a
        // client trickling audio keeps it non-idle so no idle timeout fires.
        // Cap the wall clock independently of the byte ceiling.
        deadline = setTimeout(() => reject(ws, 'max-duration'), VOICE_STREAM_MAX_MS);

        void (async () => {
          try {
            for await (const result of session!.results) {
              send(ws, { type: result.isPartial ? 'partial' : 'final', text: result.text });
            }
            send(ws, { type: 'done' });
          } catch (error) {
            console.error('voice stream error:', error);
            send(ws, { type: 'error', reason: 'transcribe-failed' });
          }
        })();
      },

      onMessage(event, ws) {
        const data = event.data;
        if (typeof data === 'string') {
          // Only control messages arrive as text.
          try {
            if ((JSON.parse(data) as { type?: string }).type === 'end') finish();
          } catch {
            // Not a control frame we understand — ignore rather than act on it.
          }
          return;
        }

        const chunk =
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : ArrayBuffer.isView(data)
              ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
              : null;
        if (!chunk || !session) return;

        bytes += chunk.byteLength;
        if (bytes > VOICE_STREAM_MAX_BYTES) {
          reject(ws, 'max-audio');
          return;
        }
        session.write(chunk);
      },

      onClose() {
        closed = true;
        finish();
      },
    };
  }),
);


/**
 * Record a completed exchange, if persistence is enabled.
 *
 * Never allowed to fail a request: the member already has their answer, and
 * losing a history row is not worth turning a good answer into an error. The
 * failure is logged with the request id so it's still findable.
 */
async function record(
  c: Context<{ Variables: RequestIdVariables & RequesterVariables }>,
  messages: ChatMessage[],
  recommendation: PeptideRecommendation,
): Promise<void> {
  if (!persistConversations) return;
  const question = messages[messages.length - 1]!.content;
  try {
    const requester = c.get('requester');
    const conversationId = await conversationService.findOrCreate(requester, question);
    await conversationService.recordExchange(conversationId, question, recommendation.answer, {
      citations: recommendation.citations,
      model: (await brainConfig.get()).model,
    });
  } catch (error) {
    console.error(
      JSON.stringify({ reqId: c.get('requestId'), error: `conversation persist failed: ${error}` }),
    );
  }
}

/**
 * Assemble the companion state the UI drives the next turn from: the lead as a
 * view, the next field to ask (or null when capture is done), and the
 * admin-managed copy. One shape for both GET and POST responses.
 */
function companionState(
  row: Awaited<ReturnType<typeof profileService.get>>,
  config: ResolvedBrainConfig,
): CompanionState {
  const field = profileService.nextField(row);
  return {
    profile: profileService.toView(row),
    nextStep: field
      ? captureStepFor(field, {
          name: config.companionNamePrompt,
          email: config.companionEmailPrompt,
          goal: config.companionGoalPrompt,
        })
      : null,
    copy: {
      greeting: config.companionGreeting,
      conversionPrompt: config.companionConversionPrompt,
      conversionCtaLabel: config.companionConversionCtaLabel,
    },
  };
}

/**
 * Everything the brain serves lives under `/api/brain/*`, which is what lets
 * the ALB route to this service on a single listener rule rather than a list of
 * paths that has to be edited every time an endpoint is added.
 *
 * Routes are defined in one chain so `typeof routes` carries the full
 * request/response shape — that's what @joice/api-client consumes via Hono RPC.
 */
const routes = app
  // 503 when the DB is unreachable, so the ALB drains the task and the ECS
  // circuit breaker can actually catch a broken release.
  .get('/health', async (c) => {
    const report = await checkHealth();
    return c.json(report, report.ok ? 200 : 503);
  })
  /**
   * Public-safe slice of the admin-managed config (copy + citation visibility),
   * served from a ~30s cache. Never exposes the system prompt or guardrails.
   */
  .get('/api/brain/config', rateLimit({ windowMs: 60_000, max: 60 }), async (c) => {
    const config = await brainConfig.get();
    return c.json({
      emptyStateHint: config.emptyStateHint,
      inputPlaceholder: config.inputPlaceholder,
      disclaimer: config.disclaimer,
      showCitations: config.showCitations,
    });
  })
  /**
   * The RAG chatbot. Public pre-launch but tightly rate-limited — every request
   * costs Bedrock tokens. The non-streaming variant keeps the typed-client
   * flow; /stream is the chat-UI path (SSE isn't consumable via hc hooks).
   */
  .post(
    '/api/brain/chat',
    rateLimit({ windowMs: 60_000, max: 5 }),
    zValidator('json', chatRequestSchema),
    async (c) => {
      const { messages } = c.req.valid('json');
      const recommendation = await recommendations.recommend(messages);
      await record(c, messages, recommendation);
      return c.json(recommendation);
    },
  )
  .post(
    '/api/brain/chat/stream',
    rateLimit({ windowMs: 60_000, max: 5 }),
    zValidator('json', chatRequestSchema),
    async (c) => {
      const { messages } = c.req.valid('json');
      return streamSSE(c, async (stream) => {
        // A closed tab should stop costing money. Without this the generation
        // ran to completion, billed in full, writing to nobody.
        const aborted = c.req.raw.signal;
        try {
          for await (const event of recommendations.recommendStream(messages)) {
            if (aborted.aborted || stream.aborted || stream.closed) break;
            if (event.type === 'delta') {
              await stream.writeSSE({ event: 'delta', data: JSON.stringify({ text: event.text }) });
            } else {
              await stream.writeSSE({
                event: 'complete',
                data: JSON.stringify(event.recommendation),
              });
              await record(c, messages, event.recommendation);
            }
          }
        } catch (err) {
          if (aborted.aborted || stream.aborted) return; // the client left; not an error
          console.error(JSON.stringify({ reqId: c.get('requestId'), error: String(err) }));
          console.error('RAG stream error:', err);
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ error: 'Something went wrong. Please try again.' }),
          });
        }
      });
    },
  )
  /**
   * Voice: speech→text and text→speech via Transcribe/Polly (AWS BAA — audio is
   * processed in memory only, never persisted or logged). Rate-limited: both
   * endpoints cost per invocation.
   */
  .post('/api/brain/voice/transcribe', rateLimit({ windowMs: 60_000, max: 10 }), async (c) => {
    // Raw 16kHz mono PCM16 from the browser recorder — ~2MB ≈ 60s hard cap.
    const audio = await c.req.arrayBuffer();
    if (audio.byteLength === 0) return c.json({ error: 'Empty audio' }, 400);
    if (audio.byteLength > 2 * 1024 * 1024) return c.json({ error: 'Recording too long' }, 413);
    const transcript = await transcriber.transcribe(new Uint8Array(audio));
    return c.json({ transcript });
  })
  .post(
    '/api/brain/voice/speak',
    // Answers are synthesized sentence-by-sentence so speech starts while the
    // text is still streaming — one answer is several small calls, not one big
    // one. Same total characters (and so the same Polly cost), more requests.
    rateLimit({ windowMs: 60_000, max: 60 }),
    zValidator('json', speakRequestSchema),
    async (c) => {
      const { text } = c.req.valid('json');
      const audio = await speech.synthesize(stripCitationMarkers(text));
      c.header('Content-Type', 'audio/mpeg');
      return c.body(audio.buffer as ArrayBuffer);
    },
  )
  /**
   * The requester's past threads. Scoped to whoever is asking — anonymous by
   * session cookie today, by member id once sign-in exists — so a conversation
   * id alone is never enough to read someone else's history.
   *
   * Reads stay available even with persistence off, so existing history is
   * still reachable if the flag is turned back off.
   */
  .get('/api/brain/conversations', rateLimit({ windowMs: 60_000, max: 30 }), async (c) => {
    return c.json(await conversationService.list(c.get('requester')));
  })
  .get(
    '/api/brain/conversations/:id',
    rateLimit({ windowMs: 60_000, max: 30 }),
    zValidator('param', conversationIdParamSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const conversation = await conversationService.get(id, c.get('requester'));
      if (!conversation) return c.json({ error: 'Conversation not found' }, 404);
      return c.json(conversation);
    },
  )
  /**
   * The pre-onboarding companion's lead capture. Deterministic, no model — the
   * UI reads the current state (which field to ask next, the copy to say) and
   * submits answers here. Marketing-grade data (name/email/goal); stored
   * unconditionally, separate from health-question content. Scoped to the
   * session by `identifyRequester`, so a lead is only ever the requester's own.
   */
  .get('/api/brain/profile', rateLimit({ windowMs: 60_000, max: 60 }), async (c) => {
    const [row, config] = await Promise.all([
      profileService.get(c.get('requester')),
      brainConfig.get(),
    ]);
    return c.json(companionState(row, config));
  })
  .post(
    '/api/brain/profile',
    rateLimit({ windowMs: 60_000, max: 30 }),
    zValidator('json', companionActionSchema),
    async (c) => {
      const requester: Requester = c.get('requester');
      const action = c.req.valid('json');
      const config = await brainConfig.get();

      try {
        if (action.kind === 'field') {
          const row = await profileService.applyField(
            requester,
            action.field,
            action.value,
            action.note,
          );
          return c.json<CompanionActionResult>(companionState(row, config));
        }
        if (action.kind === 'skip') {
          const row = await profileService.skip(requester, action.field);
          return c.json<CompanionActionResult>(companionState(row, config));
        }
        // ready — the lead signal. Hand off to the onboarding flow.
        const row = await profileService.markReady(requester);
        return c.json<CompanionActionResult>({
          ...companionState(row, config),
          handoff: { href: '/get-started' },
        });
      } catch (error) {
        // A rejected field value is a 400 the widget shows inline; anything else
        // is a real error and rethrows to the shared handler.
        if (error instanceof ProfileValidationError) {
          return c.json({ error: error.message, field: error.field }, 400);
        }
        throw error;
      }
    },
  );

export type BrainAppType = typeof routes;
// `routes` is the same instance as `app`, but typed with the full route chain.
export default routes;
