import type {
  ContentBlock,
  ConverseClient,
  GenerationRequest,
  GenerationResult,
  StopReason,
  Usage,
  ToolSpec,
} from '../providers/bedrock';
import type { ChatAction } from '../conversation/schemas';

/**
 * The agentic loop: stream the model, execute the tools it asks for, feed the
 * results back, repeat — bounded by rounds and tokens so a confused model
 * cannot burn money.
 *
 * Deliberately generic: it knows nothing about retrieval, catalogues, or
 * provenance. Executors are closures built per-request by the answer service,
 * which is where citation registries and prefetches live. The loop's only
 * jobs are Converse mechanics, caps, and never letting an executor failure
 * crash the stream.
 *
 * Turn discipline: the wire contract stays client-owned alternating text
 * turns; everything below appends `assistant(blocks)` / `user(toolResults)`
 * pairs which also alternate, so Converse's alternation rule holds throughout.
 * The final-round nudge rides INSIDE the toolResult user turn (as a trailing
 * text block) for the same reason — a separate user turn would break it.
 */

export interface ToolOutcome {
  /** What the model sees. Keep it plain text; number documents for citations. */
  resultText: string;
  /** A UI signal to surface (handoff card, intent nudge). Never persisted. */
  action?: ChatAction;
  isError?: boolean;
}

export interface ToolExecutor {
  spec: ToolSpec;
  /**
   * MUST validate `input` itself (the stream parser degrades malformed tool
   * JSON to `{}`) and answer a mismatch with `isError: true` rather than
   * throwing — though a throw is caught and fed back as an error result too.
   */
  execute(input: unknown): Promise<ToolOutcome>;
}

export type LoopEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; status: 'started' | 'finished'; ok: boolean }
  | { type: 'action'; action: ChatAction }
  | { type: 'done'; text: string; usage: Usage; stopReason: StopReason; rounds: number };

/** Accumulated input+output tokens across the whole loop before it's cut off. */
export const DEFAULT_TOOL_TOKEN_BUDGET = 24_000;

/**
 * Tool calls executed per round; the rest get an isError result. Converse
 * requires a toolResult for every toolUse id, so extras are answered — with
 * "too many", not with data — rather than dropped.
 */
export const MAX_TOOL_USES_PER_ROUND = 4;

const FINAL_NUDGE =
  'You have no tool calls remaining. Answer the question now using only the tool results ' +
  'above. If they did not contain the answer, say plainly what you could not find — do not guess.';

export async function* runToolLoop(opts: {
  generation: ConverseClient;
  /** Must carry `tools`; `turns` is the starting conversation. */
  request: GenerationRequest;
  executors: Map<string, ToolExecutor>;
  /** Tool-execution rounds (model calls = rounds + 1 at most). */
  maxRounds?: number;
  tokenBudget?: number;
}): AsyncGenerator<LoopEvent> {
  const maxRounds = opts.maxRounds ?? 3;
  const tokenBudget = opts.tokenBudget ?? DEFAULT_TOOL_TOKEN_BUDGET;
  const turns = [...opts.request.turns];
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let answerText = '';
  let rounds = 0;
  /** Set once the no-more-tools nudge has been sent — the next call is final. */
  let nudged = false;

  for (;;) {
    let result: GenerationResult | null = null;
    let textThisCall = false;

    for await (const event of opts.generation.converseStream({ ...opts.request, turns })) {
      if (event.type === 'text') {
        // Keep the streamed transcript byte-identical to the final answer:
        // text from a later call gets a real separator, emitted as a delta too.
        if (!textThisCall && answerText.length > 0) {
          answerText += '\n\n';
          yield { type: 'delta', text: '\n\n' };
        }
        textThisCall = true;
        answerText += event.text;
        yield { type: 'delta', text: event.text };
      } else if (event.type === 'toolUseStart') {
        yield { type: 'tool', name: event.name, status: 'started', ok: true };
      } else {
        result = event.result;
      }
    }
    if (!result) throw new Error('generation stream ended without a result');

    usage.inputTokens += result.usage.inputTokens;
    usage.outputTokens += result.usage.outputTokens;
    if (result.usage.cacheReadInputTokens !== undefined) {
      usage.cacheReadInputTokens =
        (usage.cacheReadInputTokens ?? 0) + result.usage.cacheReadInputTokens;
    }
    if (result.usage.cacheWriteInputTokens !== undefined) {
      usage.cacheWriteInputTokens =
        (usage.cacheWriteInputTokens ?? 0) + result.usage.cacheWriteInputTokens;
    }

    const toolUses = result.blocks.filter(
      (b): b is Extract<ContentBlock, { type: 'toolUse' }> => b.type === 'toolUse',
    );

    // Done: the model answered — or kept asking for tools after being told to
    // stop (nudge sent, or rounds cap reached), in which case we finalize with
    // what we have rather than looping forever.
    if (result.stopReason !== 'tool_use' || toolUses.length === 0 || nudged || rounds >= maxRounds) {
      yield { type: 'done', text: answerText, usage, stopReason: result.stopReason, rounds };
      return;
    }

    rounds += 1;
    const executed = toolUses.slice(0, MAX_TOOL_USES_PER_ROUND);
    const overflow = toolUses.slice(MAX_TOOL_USES_PER_ROUND);
    const outcomes = await Promise.all(
      executed.map(async (tu) => {
        const executor = opts.executors.get(tu.name);
        if (!executor) {
          return {
            tu,
            outcome: {
              resultText: `Unknown tool "${tu.name}". Available tools: ${[...opts.executors.keys()].join(', ')}.`,
              isError: true,
            } as ToolOutcome,
          };
        }
        try {
          return { tu, outcome: await executor.execute(tu.input) };
        } catch (error) {
          // Tool inputs derive from member questions — log the tool and error
          // names only, never the input or message.
          console.error(
            `agent-loop: tool ${tu.name} threw ${(error as Error)?.name ?? 'Error'}`,
          );
          return {
            tu,
            outcome: {
              resultText:
                `The ${tu.name} tool failed. Answer from what you already have, ` +
                'or say what you could not check.',
              isError: true,
            } as ToolOutcome,
          };
        }
      }),
    );

    // Converse requires a toolResult per toolUse id, so a fan-out past the
    // per-round cap is answered with errors rather than left dangling.
    for (const tu of overflow) {
      outcomes.push({
        tu,
        outcome: {
          resultText: `Too many tool calls in one turn — only the first ${MAX_TOOL_USES_PER_ROUND} ran. Ask again for what you still need.`,
          isError: true,
        },
      });
    }

    for (const { tu, outcome } of outcomes) {
      yield { type: 'tool', name: tu.name, status: 'finished', ok: !outcome.isError };
      if (outcome.action) yield { type: 'action', action: outcome.action };
    }

    turns.push({ role: 'assistant', content: result.blocks });
    const resultBlocks: ContentBlock[] = outcomes.map(({ tu, outcome }) => ({
      type: 'toolResult',
      toolUseId: tu.toolUseId,
      content: outcome.resultText,
      ...(outcome.isError ? { isError: true } : {}),
    }));
    // Last allowed round (by count or by spend): tell the model to land the
    // answer. Tools stay in the request — dropping toolConfig would invalidate
    // the cached prefix and change the request shape mid-conversation.
    if (rounds >= maxRounds || usage.inputTokens + usage.outputTokens >= tokenBudget) {
      nudged = true;
      resultBlocks.push({ type: 'text', text: FINAL_NUDGE });
    }
    turns.push({ role: 'user', content: resultBlocks });
  }
}
