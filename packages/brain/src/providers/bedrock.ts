import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  InvokeModelCommand,
  type ContentBlock as SdkContentBlock,
  type ConverseStreamOutput,
  type SystemContentBlock,
  type Tool,
  type TokenUsage,
} from '@aws-sdk/client-bedrock-runtime';
import { NodeHttpHandler } from '@smithy/node-http-handler';

/**
 * Thin Bedrock clients behind narrow interfaces. Everything AI-related goes
 * through Bedrock (never third-party endpoints) so the whole path stays under
 * the AWS BAA — see infra/README.md. Both authenticate via the ECS task role
 * (SigV4 default credential chain); there are no API keys anywhere.
 *
 * Generation uses the model-agnostic Converse API, so RAG_MODEL can be any
 * Bedrock chat model — Claude via a dated cross-region inference profile
 * (e.g. `us.anthropic.claude-sonnet-4-5-20250929-v1:0`; confirm the exact id
 * with `aws bedrock list-inference-profiles`) or Amazon Nova
 * (`us.amazon.nova-pro-v1:0`, available with no use-case form).
 *
 * These interfaces are also the swap seam: tests stub them, and moving to a
 * different provider later only touches this file. The tool-calling surface
 * (`converse`/`converseStream`, content blocks, `ToolSpec`) lives here for the
 * same reason — the agent loop upstream is provider-blind.
 */

const TITAN_MODEL_ID = 'amazon.titan-embed-text-v2:0';

/**
 * Shared client config: force HTTP/1.1 (Bun's http2 drops connections under
 * sustained load — "http2 request did not get a response") and give the SDK
 * generous built-in retries on top of ours.
 */
function createRuntimeClient(region: string): BedrockRuntimeClient {
  return new BedrockRuntimeClient({
    region,
    maxAttempts: 5,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 5_000,
      socketTimeout: 60_000,
    }),
  });
}

const RETRYABLE = /http2|ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|socket|Throttl|TooManyRequests|ServiceUnavailable|InternalServer|ModelTimeout|timed? ?out/i;

/** Retry transient transport/throttle failures with exponential backoff + jitter. */
async function withRetry<T>(operation: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const text = `${(error as Error)?.name ?? ''} ${(error as Error)?.message ?? ''}`;
      if (!RETRYABLE.test(text) || attempt === attempts - 1) throw error;
      const delay = 500 * 2 ** attempt + Math.floor(Math.random() * 250);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/** Must match the `vector(1024)` column in @joice/db — changing it means re-embedding. */
export const EMBEDDING_DIMENSIONS = 1024;

export interface EmbeddingClient {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export function createEmbeddingClient(opts: { region: string }): EmbeddingClient {
  const client = createRuntimeClient(opts.region);

  async function embed(text: string): Promise<number[]> {
    const response = await withRetry(() =>
      client.send(
        new InvokeModelCommand({
          modelId: TITAN_MODEL_ID,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            inputText: text,
            dimensions: EMBEDDING_DIMENSIONS,
            normalize: true,
          }),
        }),
      ),
    );
    const parsed = JSON.parse(new TextDecoder().decode(response.body)) as {
      embedding: number[];
    };
    return parsed.embedding;
  }

  // Titan embeds one text per call; bound concurrency so a large ingest run
  // doesn't trip Bedrock throttling.
  async function embedBatch(texts: string[]): Promise<number[][]> {
    const CONCURRENCY = 5;
    const results: number[][] = new Array(texts.length);
    let next = 0;
    async function worker() {
      while (next < texts.length) {
        const i = next++;
        results[i] = await embed(texts[i]!);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, texts.length) }, worker),
    );
    return results;
  }

  return { embed, embedBatch };
}

// ---- Generation (Converse API — any Bedrock chat model) ----

/**
 * Our content-block vocabulary — a deliberate subset of Converse's. A turn is
 * either plain text (the overwhelmingly common case, kept as a bare string so
 * existing callers and stubs never changed) or an ordered list of blocks: the
 * model asking for a tool, or us answering one.
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'toolUse'; toolUseId: string; name: string; input: unknown }
  | { type: 'toolResult'; toolUseId: string; content: string; isError?: boolean };

export interface GenerationTurn {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

/**
 * A tool the model may request. `description` carries the trigger conditions
 * ("call this when…") — Nova in particular follows prescriptive descriptions
 * far more reliably than implied ones. `inputSchema` is plain JSON Schema.
 */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface GenerationRequest {
  model: string;
  maxTokens: number;
  system: string;
  /**
   * Volatile system content (member context later). Placed AFTER the prompt
   * cache point so per-requester content never invalidates the shared prefix.
   */
  systemSuffix?: string;
  /** Conversation; the last turn must be the user's (a question or tool results). */
  turns: GenerationTurn[];
  /** When present, the request carries a toolConfig and the model may call them. */
  tools?: ToolSpec[];
  /**
   * Ask Bedrock to cache the static prefix (system prompt + tool definitions).
   * Models that reject cachePoint blocks degrade to uncached automatically.
   */
  promptCache?: boolean;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'other';

export interface GenerationResult {
  stopReason: StopReason;
  /** Text and toolUse blocks in the order the model produced them. */
  blocks: ContentBlock[];
  /** Concatenation of the text blocks — what a text-only caller wants. */
  text: string;
  usage: Usage;
}

/** Legacy text-only stream surface — unchanged, so existing consumers keep working. */
export type GenerationStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; text: string };

export type ConverseStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'toolUseStart'; toolUseId: string; name: string }
  | { type: 'done'; result: GenerationResult };

export interface GenerationClient {
  generate(request: GenerationRequest): Promise<string>;
  generateStream(request: GenerationRequest): AsyncGenerator<GenerationStreamEvent>;
}

/**
 * The tool-capable surface. Kept as a separate interface (the factory returns
 * the intersection) so the many existing text-only `GenerationClient` stubs in
 * tests stay valid; tool-loop code depends on this one.
 */
export interface ConverseClient {
  converse(request: GenerationRequest): Promise<GenerationResult>;
  converseStream(request: GenerationRequest): AsyncGenerator<ConverseStreamEvent>;
}

export function toConverseInput(
  request: GenerationRequest,
  opts: { cache?: boolean } = {},
) {
  const last = request.turns[request.turns.length - 1];
  if (!last || last.role !== 'user') {
    throw new Error('GenerationRequest.turns must end with a user turn');
  }
  const messages = request.turns.map((turn) => ({
    role: turn.role,
    content: toSdkContent(turn.content),
  }));
  // Checked after mapping so all-empty-text arrays are caught too — Converse
  // rejects both, but later and with a far worse error.
  for (const message of messages) {
    if (message.content.length === 0) {
      throw new Error('GenerationRequest turns must not have empty content');
    }
  }

  const system: SystemContentBlock[] = [{ text: request.system }];
  // The cache point sits between the static prefix and anything volatile:
  // static system → cachePoint → systemSuffix → messages. Reordering this
  // silently turns every request into a cache miss.
  if (opts.cache) system.push({ cachePoint: { type: 'default' } });
  if (request.systemSuffix) system.push({ text: request.systemSuffix });

  const input = {
    modelId: request.model,
    system,
    messages,
    inferenceConfig: { maxTokens: request.maxTokens },
  } as {
    modelId: string;
    system: SystemContentBlock[];
    messages: { role: 'user' | 'assistant'; content: SdkContentBlock[] }[];
    inferenceConfig: { maxTokens: number };
    toolConfig?: { tools: Tool[] };
    // Literal shape (not Record<string, unknown>) so it satisfies the SDK's
    // JSON DocumentType via TypeScript's implicit index signature on literals.
    additionalModelRequestFields?: { inferenceConfig: { topK: number } };
  };

  if (request.tools && request.tools.length > 0) {
    input.toolConfig = {
      tools: request.tools.map((tool) => ({
        toolSpec: {
          name: tool.name,
          description: tool.description,
          // The SDK types JSON documents opaquely; our boundary keeps plain objects.
          inputSchema: { json: tool.inputSchema as never },
        },
      })),
    };
    // AWS's own guidance for Nova tool calling: greedy decoding. Applied here
    // so callers stay model-blind.
    if (/amazon\.nova/i.test(request.model)) {
      input.additionalModelRequestFields = { inferenceConfig: { topK: 1 } };
    }
  }

  return input;
}

function toSdkContent(content: string | ContentBlock[]): SdkContentBlock[] {
  if (typeof content === 'string') return [{ text: content }];
  // Claude emits empty text blocks ahead of tool use; echoing one back is a
  // guaranteed ValidationException ("blank text"), so they never round-trip.
  const kept = content.filter((block) => !(block.type === 'text' && block.text === ''));
  return kept.map((block): SdkContentBlock => {
    switch (block.type) {
      case 'text':
        return { text: block.text };
      case 'toolUse':
        return {
          toolUse: {
            toolUseId: block.toolUseId,
            name: block.name,
            // SDK types tool input as a JSON document; `unknown` at our boundary.
            input: block.input as never,
          },
        };
      case 'toolResult':
        return {
          toolResult: {
            toolUseId: block.toolUseId,
            content: [{ text: block.content }],
            ...(block.isError ? { status: 'error' as const } : {}),
          },
        };
    }
  });
}

export function contentFromConverse(
  content: SdkContentBlock[] | undefined,
): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const block of content ?? []) {
    if (block.text) {
      blocks.push({ type: 'text', text: block.text });
    } else if (block.toolUse) {
      blocks.push({
        type: 'toolUse',
        toolUseId: block.toolUse.toolUseId ?? '',
        name: block.toolUse.name ?? '',
        input: block.toolUse.input ?? {},
      });
    }
    // Anything else (images, documents, guard content) is outside our vocabulary.
  }
  return blocks;
}

function toStopReason(reason: string | undefined): StopReason {
  return reason === 'end_turn' || reason === 'tool_use' || reason === 'max_tokens'
    ? reason
    : 'other';
}

function toUsage(usage: TokenUsage | undefined): Usage {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    ...(usage?.cacheReadInputTokens !== undefined
      ? { cacheReadInputTokens: usage.cacheReadInputTokens }
      : {}),
    ...(usage?.cacheWriteInputTokens !== undefined
      ? { cacheWriteInputTokens: usage.cacheWriteInputTokens }
      : {}),
  };
}

function textOf(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

function parseToolInput(json: string, name: string): unknown {
  if (!json) return {};
  try {
    return JSON.parse(json) as unknown;
  } catch {
    // Never crash a stream over a malformed fragment. {} is only a safe
    // sentinel because tool executors MUST validate their input and answer a
    // mismatch with an isError toolResult the model can react to.
    console.warn(`bedrock: unparseable streamed tool input for "${name}", passing {}`);
    return {};
  }
}

/**
 * Fold raw Converse stream events into our vocabulary. Pure — tests feed it
 * scripted arrays. Tool input arrives as JSON *fragments* (Claude streams many
 * small ones, Nova fewer large ones); they only concatenate to valid JSON at
 * contentBlockStop, so nothing is parsed before then.
 */
export async function* consumeConverseStream(
  stream: AsyncIterable<ConverseStreamOutput> | Iterable<ConverseStreamOutput>,
): AsyncGenerator<ConverseStreamEvent> {
  type Acc =
    | { kind: 'text'; text: string }
    | { kind: 'toolUse'; toolUseId: string; name: string; inputJson: string };
  const open = new Map<number, Acc>();
  const blocks: ContentBlock[] = [];
  let stopReason: StopReason = 'other';
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };

  const close = (index: number) => {
    const acc = open.get(index);
    if (!acc) return;
    open.delete(index);
    blocks.push(
      acc.kind === 'text'
        ? { type: 'text', text: acc.text }
        : {
            type: 'toolUse',
            toolUseId: acc.toolUseId,
            name: acc.name,
            input: parseToolInput(acc.inputJson, acc.name),
          },
    );
  };

  for await (const event of stream) {
    if (event.contentBlockStart?.start?.toolUse) {
      const index = event.contentBlockStart.contentBlockIndex ?? 0;
      const { toolUseId = '', name = '' } = event.contentBlockStart.start.toolUse;
      open.set(index, { kind: 'toolUse', toolUseId, name, inputJson: '' });
      yield { type: 'toolUseStart', toolUseId, name };
      continue;
    }

    const delta = event.contentBlockDelta;
    if (delta?.delta) {
      const index = delta.contentBlockIndex ?? 0;
      // Empty-string deltas are no-ops (the old text-only path skipped them
      // too), which also keeps empty text blocks out of the result.
      if (delta.delta.text) {
        const acc = open.get(index);
        if (acc?.kind === 'text') {
          acc.text += delta.delta.text;
        } else if (!acc) {
          // Text blocks get no contentBlockStart; the first delta opens them.
          open.set(index, { kind: 'text', text: delta.delta.text });
        }
        yield { type: 'text', text: delta.delta.text };
      } else if (delta.delta.toolUse?.input !== undefined) {
        const acc = open.get(index);
        if (acc?.kind === 'toolUse') acc.inputJson += delta.delta.toolUse.input;
      }
      continue;
    }

    if (event.contentBlockStop) {
      close(event.contentBlockStop.contentBlockIndex ?? 0);
      continue;
    }
    if (event.messageStop) {
      stopReason = toStopReason(event.messageStop.stopReason);
      continue;
    }
    if (event.metadata?.usage) {
      usage = toUsage(event.metadata.usage);
    }
  }

  // Defensive: a stream that ended without stop events still yields its blocks.
  for (const index of [...open.keys()].sort((a, b) => a - b)) close(index);

  yield { type: 'done', result: { stopReason, blocks, text: textOf(blocks), usage } };
}

/**
 * Models that rejected a cachePoint block (ValidationException). Memoized so
 * we pay the failed request once per process, not once per question.
 */
const cacheUnsupported = new Set<string>();

function isCacheRejection(error: unknown): boolean {
  const name = (error as Error)?.name ?? '';
  const message = (error as Error)?.message ?? '';
  return name === 'ValidationException' && /cache/i.test(message);
}

export function createGenerationClient(
  opts: { region: string },
): GenerationClient & ConverseClient {
  const client = createRuntimeClient(opts.region);

  function wantCache(request: GenerationRequest): boolean {
    return request.promptCache === true && !cacheUnsupported.has(request.model);
  }

  /** Send with cachePoint if asked; degrade to uncached when the model rejects it. */
  async function sendWithCacheFallback<T>(
    request: GenerationRequest,
    send: (input: ReturnType<typeof toConverseInput>) => Promise<T>,
  ): Promise<T> {
    const cache = wantCache(request);
    try {
      return await withRetry(() => send(toConverseInput(request, { cache })));
    } catch (error) {
      if (!cache || !isCacheRejection(error)) throw error;
      cacheUnsupported.add(request.model);
      console.warn(
        `bedrock: ${request.model} rejected cachePoint; continuing without prompt cache`,
      );
      return withRetry(() => send(toConverseInput(request, { cache: false })));
    }
  }

  async function converse(request: GenerationRequest): Promise<GenerationResult> {
    const response = await sendWithCacheFallback(request, (input) =>
      client.send(new ConverseCommand(input)),
    );
    const blocks = contentFromConverse(response.output?.message?.content);
    return {
      stopReason: toStopReason(response.stopReason),
      blocks,
      text: textOf(blocks),
      usage: toUsage(response.usage),
    };
  }

  async function* converseStream(
    request: GenerationRequest,
  ): AsyncGenerator<ConverseStreamEvent> {
    // Retry covers the initial send; once tokens flow, failures surface as-is.
    const response = await sendWithCacheFallback(request, (input) =>
      client.send(new ConverseStreamCommand(input)),
    );
    if (!response.stream) {
      yield {
        type: 'done',
        result: {
          stopReason: 'other',
          blocks: [],
          text: '',
          usage: { inputTokens: 0, outputTokens: 0 },
        },
      };
      return;
    }
    yield* consumeConverseStream(response.stream);
  }

  return {
    converse,
    converseStream,

    async generate(request) {
      return (await converse(request)).text;
    },

    async *generateStream(request) {
      for await (const event of converseStream(request)) {
        if (event.type === 'text') yield { type: 'text', text: event.text };
        else if (event.type === 'done') yield { type: 'done', text: event.result.text };
        // toolUseStart has no meaning on the legacy text-only surface.
      }
    },
  };
}
