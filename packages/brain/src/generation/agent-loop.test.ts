import { describe, expect, test } from 'bun:test';
import type {
  ConverseClient,
  ConverseStreamEvent,
  GenerationRequest,
  GenerationTurn,
  Usage,
} from '../providers/bedrock';
import { runToolLoop, type LoopEvent, type ToolExecutor, type ToolOutcome } from './agent-loop';

/**
 * The loop is tested with a scripted ConverseClient: call N replays the Nth
 * canned event sequence. That pins the mechanics — turn construction, caps,
 * error feeding — without any model or AWS.
 */

const USAGE: Usage = { inputTokens: 100, outputTokens: 20 };

function scripted(
  calls: ConverseStreamEvent[][],
  capture: GenerationRequest[] = [],
): ConverseClient {
  let call = 0;
  return {
    converse: () => Promise.reject(new Error('not used')),
     
    converseStream: async function* (request) {
      capture.push(structuredClone(request));
      const events = calls[call];
      if (!events) throw new Error(`unscripted call #${call + 1}`);
      call += 1;
      yield* events;
    },
  };
}

const answer = (text: string): ConverseStreamEvent[] => [
  { type: 'text', text },
  {
    type: 'done',
    result: {
      stopReason: 'end_turn',
      blocks: [{ type: 'text', text }],
      text,
      usage: USAGE,
    },
  },
];

const toolCall = (
  requests: { name: string; input?: unknown; id?: string }[],
  leadText = '',
): ConverseStreamEvent[] => {
  const events: ConverseStreamEvent[] = [];
  if (leadText) events.push({ type: 'text', text: leadText });
  for (const r of requests) {
    events.push({ type: 'toolUseStart', toolUseId: r.id ?? `tu_${r.name}`, name: r.name });
  }
  events.push({
    type: 'done',
    result: {
      stopReason: 'tool_use',
      blocks: [
        ...(leadText ? [{ type: 'text' as const, text: leadText }] : []),
        ...requests.map((r) => ({
          type: 'toolUse' as const,
          toolUseId: r.id ?? `tu_${r.name}`,
          name: r.name,
          input: r.input ?? {},
        })),
      ],
      text: leadText,
      usage: USAGE,
    },
  });
  return events;
};

function executor(name: string, outcome: Partial<ToolOutcome> = {}): ToolExecutor {
  return {
    spec: { name, description: 'test tool', inputSchema: { type: 'object' } },
    execute: async () => ({ resultText: `result:${name}`, ...outcome }),
  };
}

const executorsOf = (...list: ToolExecutor[]) => new Map(list.map((e) => [e.spec.name, e]));

const request = (tools = true): GenerationRequest => ({
  model: 'test-model',
  maxTokens: 512,
  system: 'system',
  turns: [{ role: 'user', content: 'question' }],
  ...(tools ? { tools: [{ name: 'search', description: 'd', inputSchema: {} }] } : {}),
});

async function run(opts: Parameters<typeof runToolLoop>[0]): Promise<LoopEvent[]> {
  const events: LoopEvent[] = [];
  for await (const event of runToolLoop(opts)) events.push(event);
  return events;
}

const doneOf = (events: LoopEvent[]) => {
  const done = events.at(-1)!;
  if (done.type !== 'done') throw new Error('expected done');
  return done;
};

describe('runToolLoop', () => {
  test('a plain answer passes straight through: deltas, then done with usage', async () => {
    const events = await run({
      generation: scripted([answer('The answer.')]),
      request: request(),
      executors: executorsOf(),
    });
    expect(events[0]).toEqual({ type: 'delta', text: 'The answer.' });
    const done = doneOf(events);
    expect(done.text).toBe('The answer.');
    expect(done.stopReason).toBe('end_turn');
    expect(done.rounds).toBe(0);
    expect(done.usage).toEqual(USAGE);
  });

  test('one tool round: executes, feeds the result back, and the turns alternate', async () => {
    const capture: GenerationRequest[] = [];
    const events = await run({
      generation: scripted(
        [toolCall([{ name: 'search', input: { query: 'bpc' } }]), answer('Grounded answer.')],
        capture,
      ),
      request: request(),
      executors: executorsOf(executor('search')),
    });

    expect(events.filter((e) => e.type === 'tool')).toEqual([
      { type: 'tool', name: 'search', status: 'started', ok: true },
      { type: 'tool', name: 'search', status: 'finished', ok: true },
    ]);
    const done = doneOf(events);
    expect(done.text).toBe('Grounded answer.');
    expect(done.rounds).toBe(1);
    expect(done.usage).toEqual({ inputTokens: 200, outputTokens: 40 });

    // The second call carries the assistant's toolUse turn and our toolResult.
    const turns = capture[1]!.turns;
    expect(turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user']);
    const resultTurn = turns[2]!.content as Exclude<GenerationTurn['content'], string>;
    expect(resultTurn[0]).toMatchObject({
      type: 'toolResult',
      toolUseId: 'tu_search',
      content: 'result:search',
    });
    // Alternation must hold on every call the loop makes.
    for (const req of capture) {
      req.turns.forEach((turn, i) => {
        expect(turn.role).toBe(i % 2 === 0 ? 'user' : 'assistant');
      });
    }
  });

  test('parallel tool calls execute in one round and return one toolResult turn', async () => {
    const capture: GenerationRequest[] = [];
    const events = await run({
      generation: scripted(
        [
          toolCall([
            { name: 'search', id: 'tu_a' },
            { name: 'catalogue', id: 'tu_b' },
          ]),
          answer('Both checked.'),
        ],
        capture,
      ),
      request: request(),
      executors: executorsOf(executor('search'), executor('catalogue')),
    });

    expect(doneOf(events).rounds).toBe(1);
    const resultTurn = capture[1]!.turns[2]!.content as Exclude<GenerationTurn['content'], string>;
    expect(resultTurn.map((b) => (b.type === 'toolResult' ? b.toolUseId : b.type))).toEqual([
      'tu_a',
      'tu_b',
    ]);
  });

  test('an unknown tool name becomes an isError result, not a crash', async () => {
    const capture: GenerationRequest[] = [];
    const events = await run({
      generation: scripted(
        [toolCall([{ name: 'made_up_tool' }]), answer('Recovered.')],
        capture,
      ),
      request: request(),
      executors: executorsOf(executor('search')),
    });

    expect(events).toContainEqual({
      type: 'tool',
      name: 'made_up_tool',
      status: 'finished',
      ok: false,
    });
    const resultTurn = capture[1]!.turns[2]!.content as Exclude<GenerationTurn['content'], string>;
    expect(resultTurn[0]).toMatchObject({ type: 'toolResult', isError: true });
    expect((resultTurn[0] as { content: string }).content).toContain('Unknown tool');
    expect(doneOf(events).text).toBe('Recovered.');
  });

  test('a throwing executor is fed back as an error result the model can react to', async () => {
    const boom: ToolExecutor = {
      spec: { name: 'search', description: 'd', inputSchema: {} },
      execute: () => Promise.reject(new Error('db down')),
    };
    const capture: GenerationRequest[] = [];
    const events = await run({
      generation: scripted([toolCall([{ name: 'search' }]), answer('Partial answer.')], capture),
      request: request(),
      executors: executorsOf(boom),
    });

    expect(events).toContainEqual({ type: 'tool', name: 'search', status: 'finished', ok: false });
    const resultTurn = capture[1]!.turns[2]!.content as Exclude<GenerationTurn['content'], string>;
    expect(resultTurn[0]).toMatchObject({ type: 'toolResult', isError: true });
    // The error message itself never reaches the model (or the logs' bodies).
    expect((resultTurn[0] as { content: string }).content).not.toContain('db down');
  });

  test('the final round carries the no-more-tools nudge inside the toolResult turn', async () => {
    const capture: GenerationRequest[] = [];
    await run({
      generation: scripted([toolCall([{ name: 'search' }]), answer('Landed.')], capture),
      request: request(),
      executors: executorsOf(executor('search')),
      maxRounds: 1,
    });

    const resultTurn = capture[1]!.turns[2]!.content as Exclude<GenerationTurn['content'], string>;
    const last = resultTurn.at(-1)!;
    expect(last.type).toBe('text');
    expect((last as { text: string }).text).toContain('no tool calls remaining');
    // Tools stay in the request even on the final call.
    expect(capture[1]!.tools).toBeDefined();
  });

  test('a model that keeps demanding tools past the cap is finalized, not looped', async () => {
    const events = await run({
      generation: scripted([
        toolCall([{ name: 'search' }], 'Looking. '),
        toolCall([{ name: 'search' }]),
      ]),
      request: request(),
      executors: executorsOf(executor('search')),
      maxRounds: 1,
    });

    const done = doneOf(events);
    expect(done.stopReason).toBe('tool_use');
    expect(done.text).toBe('Looking. ');
    expect(done.rounds).toBe(1); // never a third call
  });

  test('blowing the token budget triggers the nudge even with rounds to spare', async () => {
    const capture: GenerationRequest[] = [];
    await run({
      generation: scripted([toolCall([{ name: 'search' }]), answer('Done.')], capture),
      request: request(),
      executors: executorsOf(executor('search')),
      maxRounds: 5,
      tokenBudget: 50, // first call's 120 tokens already exceed it
    });

    const resultTurn = capture[1]!.turns[2]!.content as Exclude<GenerationTurn['content'], string>;
    expect((resultTurn.at(-1) as { text: string }).text).toContain('no tool calls remaining');
  });

  test('actions surface as events in execution order', async () => {
    const events = await run({
      generation: scripted([toolCall([{ name: 'handoff' }]), answer('Ok.')]),
      request: request(),
      executors: executorsOf(
        executor('handoff', { action: { kind: 'handoff', reason: 'member_request' } }),
      ),
    });
    expect(events).toContainEqual({
      type: 'action',
      action: { kind: 'handoff', reason: 'member_request' },
    });
  });

  test('text split across calls gets a real separator, emitted as a delta too', async () => {
    const events = await run({
      generation: scripted([
        toolCall([{ name: 'search' }], 'Let me check.'),
        answer('BPC-157 is dosed at…'),
      ]),
      request: request(),
      executors: executorsOf(executor('search')),
    });

    const deltas = events.filter((e) => e.type === 'delta').map((e) => e.text);
    expect(deltas).toEqual(['Let me check.', '\n\n', 'BPC-157 is dosed at…']);
    expect(doneOf(events).text).toBe('Let me check.\n\nBPC-157 is dosed at…');
  });
});
