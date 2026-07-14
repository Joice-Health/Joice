import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

/**
 * Thin Bedrock clients behind narrow interfaces. Everything AI-related goes
 * through Bedrock (never third-party endpoints) so the whole path stays under
 * the AWS BAA — see infra/README.md. Both authenticate via the ECS task role
 * (SigV4 default credential chain); there are no API keys anywhere.
 *
 * Generation uses the model-agnostic Converse API, so RAG_MODEL can be any
 * Bedrock chat model — Claude in prod (`us.anthropic.claude-sonnet-5`, once
 * the account's Anthropic use-case form is approved) or Amazon Nova for dev
 * (`us.amazon.nova-pro-v1:0`, available with no form).
 *
 * These interfaces are also the swap seam: tests stub them, and moving to a
 * different provider later only touches this file.
 */

const TITAN_MODEL_ID = 'amazon.titan-embed-text-v2:0';

/** Must match the `vector(1024)` column in @joice/db — changing it means re-embedding. */
export const EMBEDDING_DIMENSIONS = 1024;

export interface EmbeddingClient {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export function createEmbeddingClient(opts: { region: string }): EmbeddingClient {
  const client = new BedrockRuntimeClient({ region: opts.region });

  async function embed(text: string): Promise<number[]> {
    const response = await client.send(
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

export interface GenerationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerationRequest {
  model: string;
  maxTokens: number;
  system: string;
  /** Conversation; the last turn must be the user's (documents already inlined). */
  turns: GenerationTurn[];
}

export type GenerationStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; text: string };

export interface GenerationClient {
  generate(request: GenerationRequest): Promise<string>;
  generateStream(request: GenerationRequest): AsyncGenerator<GenerationStreamEvent>;
}

function toConverseInput(request: GenerationRequest) {
  const last = request.turns[request.turns.length - 1];
  if (!last || last.role !== 'user') {
    throw new Error('GenerationRequest.turns must end with a user turn');
  }
  return {
    modelId: request.model,
    system: [{ text: request.system }],
    messages: request.turns.map((turn) => ({
      role: turn.role,
      content: [{ text: turn.content }],
    })),
    inferenceConfig: { maxTokens: request.maxTokens },
  };
}

export function createGenerationClient(opts: { region: string }): GenerationClient {
  const client = new BedrockRuntimeClient({ region: opts.region });

  return {
    async generate(request) {
      const response = await client.send(new ConverseCommand(toConverseInput(request)));
      return (
        response.output?.message?.content?.map((block) => block.text ?? '').join('') ?? ''
      );
    },

    async *generateStream(request) {
      const response = await client.send(
        new ConverseStreamCommand(toConverseInput(request)),
      );
      let full = '';
      for await (const event of response.stream ?? []) {
        const delta = event.contentBlockDelta?.delta?.text;
        if (delta) {
          full += delta;
          yield { type: 'text', text: delta };
        }
      }
      yield { type: 'done', text: full };
    },
  };
}
