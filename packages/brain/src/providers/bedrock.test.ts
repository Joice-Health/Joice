import { describe, expect, test } from 'bun:test';
import type { ConverseStreamOutput } from '@aws-sdk/client-bedrock-runtime';
import {
  consumeConverseStream,
  contentFromConverse,
  toConverseInput,
  type ConverseStreamEvent,
  type GenerationRequest,
} from './bedrock';

/**
 * The provider is the swap seam, so its two pure halves get direct tests:
 * `toConverseInput` (our request → Converse input) and `consumeConverseStream`
 * (raw Converse events → our vocabulary). No AWS anywhere.
 */

const baseRequest: GenerationRequest = {
  model: 'us.amazon.nova-pro-v1:0',
  maxTokens: 512,
  system: 'You are a test.',
  turns: [{ role: 'user', content: 'hello' }],
};

const TOOL = {
  name: 'search_notes',
  description: 'Search the clinical notes.',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
};

async function collect(
  events: ConverseStreamOutput[],
): Promise<ConverseStreamEvent[]> {
  const out: ConverseStreamEvent[] = [];
  for await (const event of consumeConverseStream(events)) out.push(event);
  return out;
}

describe('toConverseInput', () => {
  test('string content becomes a single text block; no toolConfig without tools', () => {
    const input = toConverseInput(baseRequest);
    expect(input.messages).toEqual([{ role: 'user', content: [{ text: 'hello' }] }]);
    expect(input.system).toEqual([{ text: 'You are a test.' }]);
    expect(input.toolConfig).toBeUndefined();
    expect(input.additionalModelRequestFields).toBeUndefined();
  });

  test('rejects a request that does not end with a user turn', () => {
    expect(() =>
      toConverseInput({
        ...baseRequest,
        turns: [{ role: 'assistant', content: 'hi' }],
      }),
    ).toThrow('must end with a user turn');
    expect(() => toConverseInput({ ...baseRequest, turns: [] })).toThrow(
      'must end with a user turn',
    );
  });

  test('rejects empty content-block arrays (Converse rejects them anyway, later and worse)', () => {
    expect(() =>
      toConverseInput({
        ...baseRequest,
        turns: [
          { role: 'user', content: [] },
          { role: 'user', content: 'ok' },
        ],
      }),
    ).toThrow('empty content');
  });

  test('maps toolUse and toolResult blocks to the Converse shapes', () => {
    const input = toConverseInput({
      ...baseRequest,
      turns: [
        { role: 'user', content: 'find bpc' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Looking…' },
            { type: 'toolUse', toolUseId: 'tu_1', name: 'search_notes', input: { query: 'bpc' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'toolResult', toolUseId: 'tu_1', content: 'nothing found', isError: true },
          ],
        },
      ],
    });

    expect(input.messages[1]!.content).toEqual([
      { text: 'Looking…' },
      { toolUse: { toolUseId: 'tu_1', name: 'search_notes', input: { query: 'bpc' } } },
    ]);
    expect(input.messages[2]!.content).toEqual([
      {
        toolResult: {
          toolUseId: 'tu_1',
          content: [{ text: 'nothing found' }],
          status: 'error',
        },
      },
    ]);
  });

  test('tools produce a toolConfig, and Nova models get greedy decoding', () => {
    const input = toConverseInput({ ...baseRequest, tools: [TOOL] });
    expect(input.toolConfig).toEqual({
      tools: [
        {
          toolSpec: {
            name: 'search_notes',
            description: 'Search the clinical notes.',
            inputSchema: { json: TOOL.inputSchema },
          },
        },
      ],
    });
    expect(input.additionalModelRequestFields).toEqual({
      inferenceConfig: { topK: 1 },
    });
  });

  test('non-Nova models with tools do not get the Nova decoding override', () => {
    const input = toConverseInput({
      ...baseRequest,
      model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      tools: [TOOL],
    });
    expect(input.toolConfig).toBeDefined();
    expect(input.additionalModelRequestFields).toBeUndefined();
  });

  test('empty text blocks never round-trip (Claude emits them ahead of tool use)', () => {
    const input = toConverseInput({
      ...baseRequest,
      turns: [
        { role: 'user', content: 'find bpc' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: '' },
            { type: 'toolUse', toolUseId: 'tu_1', name: 'search_notes', input: { query: 'bpc' } },
          ],
        },
        { role: 'user', content: [{ type: 'toolResult', toolUseId: 'tu_1', content: 'ok' }] },
      ],
    });
    expect(input.messages[1]!.content).toEqual([
      { toolUse: { toolUseId: 'tu_1', name: 'search_notes', input: { query: 'bpc' } } },
    ]);

    // A turn that is ONLY an empty text block is rejected up front.
    expect(() =>
      toConverseInput({
        ...baseRequest,
        turns: [{ role: 'user', content: [{ type: 'text', text: '' }] }],
      }),
    ).toThrow('empty content');
  });

  test('cachePoint sits between the static system and the volatile suffix', () => {
    const input = toConverseInput(
      { ...baseRequest, systemSuffix: 'Member: Shaun.' },
      { cache: true },
    );
    expect(input.system).toEqual([
      { text: 'You are a test.' },
      { cachePoint: { type: 'default' } },
      { text: 'Member: Shaun.' },
    ]);
  });

  test('no cachePoint unless asked; suffix still lands after the static system', () => {
    const input = toConverseInput({ ...baseRequest, systemSuffix: 'Member: Shaun.' });
    expect(input.system).toEqual([
      { text: 'You are a test.' },
      { text: 'Member: Shaun.' },
    ]);
  });
});

describe('consumeConverseStream', () => {
  test('text-only stream: deltas then a done with text, stopReason and usage', async () => {
    const events = await collect([
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Hello ' } } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'world.' } } },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { messageStop: { stopReason: 'end_turn' } },
      { metadata: { usage: { inputTokens: 120, outputTokens: 8, totalTokens: 128 }, metrics: { latencyMs: 1 } } },
    ]);

    expect(events[0]).toEqual({ type: 'text', text: 'Hello ' });
    expect(events[1]).toEqual({ type: 'text', text: 'world.' });
    const done = events.at(-1)!;
    if (done.type !== 'done') throw new Error('expected done');
    expect(done.result.text).toBe('Hello world.');
    expect(done.result.stopReason).toBe('end_turn');
    expect(done.result.blocks).toEqual([{ type: 'text', text: 'Hello world.' }]);
    expect(done.result.usage).toEqual({ inputTokens: 120, outputTokens: 8 });
  });

  test('tool use with fragmented JSON input parses only at block stop', async () => {
    const events = await collect([
      {
        contentBlockStart: {
          contentBlockIndex: 0,
          start: { toolUse: { toolUseId: 'tu_1', name: 'search_notes' } },
        },
      },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: '{"que' } } } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: 'ry":"bpc' } } } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: ' dosing"}' } } } },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { messageStop: { stopReason: 'tool_use' } },
      { metadata: { usage: { inputTokens: 300, outputTokens: 25, totalTokens: 325 }, metrics: { latencyMs: 1 } } },
    ]);

    expect(events[0]).toEqual({
      type: 'toolUseStart',
      toolUseId: 'tu_1',
      name: 'search_notes',
    });
    const done = events.at(-1)!;
    if (done.type !== 'done') throw new Error('expected done');
    expect(done.result.stopReason).toBe('tool_use');
    expect(done.result.blocks).toEqual([
      {
        type: 'toolUse',
        toolUseId: 'tu_1',
        name: 'search_notes',
        input: { query: 'bpc dosing' },
      },
    ]);
  });

  test('text and parallel tool blocks keep their order and separate indexes', async () => {
    const events = await collect([
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Let me check.' } } },
      { contentBlockStop: { contentBlockIndex: 0 } },
      {
        contentBlockStart: {
          contentBlockIndex: 1,
          start: { toolUse: { toolUseId: 'tu_a', name: 'search_notes' } },
        },
      },
      { contentBlockDelta: { contentBlockIndex: 1, delta: { toolUse: { input: '{"query":"a"}' } } } },
      {
        contentBlockStart: {
          contentBlockIndex: 2,
          start: { toolUse: { toolUseId: 'tu_b', name: 'search_catalogue' } },
        },
      },
      { contentBlockDelta: { contentBlockIndex: 2, delta: { toolUse: { input: '{"query":"b"}' } } } },
      { contentBlockStop: { contentBlockIndex: 1 } },
      { contentBlockStop: { contentBlockIndex: 2 } },
      { messageStop: { stopReason: 'tool_use' } },
    ]);

    const done = events.at(-1)!;
    if (done.type !== 'done') throw new Error('expected done');
    expect(done.result.blocks.map((b) => b.type)).toEqual(['text', 'toolUse', 'toolUse']);
    expect(done.result.text).toBe('Let me check.');
    const [, a, b] = done.result.blocks;
    expect(a).toMatchObject({ toolUseId: 'tu_a', input: { query: 'a' } });
    expect(b).toMatchObject({ toolUseId: 'tu_b', input: { query: 'b' } });
  });

  test('unparseable tool input degrades to {} instead of crashing the stream', async () => {
    const events = await collect([
      {
        contentBlockStart: {
          contentBlockIndex: 0,
          start: { toolUse: { toolUseId: 'tu_1', name: 'search_notes' } },
        },
      },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: '{"query": tr' } } } },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { messageStop: { stopReason: 'tool_use' } },
    ]);

    const done = events.at(-1)!;
    if (done.type !== 'done') throw new Error('expected done');
    expect(done.result.blocks[0]).toMatchObject({ type: 'toolUse', input: {} });
  });

  test('a stream that dies without stop events still yields its accumulated blocks', async () => {
    const events = await collect([
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Partial ans' } } },
    ]);

    const done = events.at(-1)!;
    if (done.type !== 'done') throw new Error('expected done');
    expect(done.result.text).toBe('Partial ans');
    expect(done.result.stopReason).toBe('other');
  });

  test('cache token counts surface when Bedrock reports them', async () => {
    const events = await collect([
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'hi' } } },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { messageStop: { stopReason: 'end_turn' } },
      {
        metadata: {
          usage: {
            inputTokens: 40,
            outputTokens: 2,
            totalTokens: 42,
            cacheReadInputTokens: 1800,
            cacheWriteInputTokens: 0,
          },
          metrics: { latencyMs: 1 },
        },
      },
    ]);

    const done = events.at(-1)!;
    if (done.type !== 'done') throw new Error('expected done');
    expect(done.result.usage).toEqual({
      inputTokens: 40,
      outputTokens: 2,
      cacheReadInputTokens: 1800,
      cacheWriteInputTokens: 0,
    });
  });
});

describe('contentFromConverse', () => {
  test('maps text and toolUse blocks and skips unknown block kinds', () => {
    const blocks = contentFromConverse([
      { text: 'Answer.' },
      { toolUse: { toolUseId: 'tu_1', name: 'search_notes', input: { query: 'x' } } },
      { image: { format: 'png', source: { bytes: new Uint8Array() } } } as never,
    ]);
    expect(blocks).toEqual([
      { type: 'text', text: 'Answer.' },
      { type: 'toolUse', toolUseId: 'tu_1', name: 'search_notes', input: { query: 'x' } },
    ]);
  });
});
