import { z } from 'zod';
import { INTENT_KINDS } from '../conversation/schemas';
import { invalidInput, type BrainTool } from './types';

// Spec and zod schema describe the same contract and move together.
const intentInput = z.object({ intent: z.enum(INTENT_KINDS) });

export const flagIntentTool: BrainTool = {
  // Deliberately silent: a buying signal is interface plumbing, and announcing
  // "noting your interest…" mid-answer would be creepy rather than transparent.
  label: '',
  spec: {
    name: 'flag_intent',
    description:
      'Signal that the member sounds ready to start with Joice (asking how to sign up, join, ' +
      'begin, or about membership). This only nudges the interface to offer the next step at ' +
      'the right moment — it stores nothing and shows nothing by itself. Keep answering ' +
      'normally after calling it.',
    inputSchema: {
      type: 'object',
      properties: { intent: { type: 'string', enum: [...INTENT_KINDS] } },
      required: ['intent'],
    },
  },
  create() {
    return async (raw) => {
      const input = intentInput.safeParse(raw);
      if (!input.success) return invalidInput(`{ "intent": one of ${INTENT_KINDS.join(' | ')} }`);
      return {
        resultText: 'Noted — keep answering the question normally.',
        action: { kind: 'intent', intent: input.data.intent },
      };
    };
  },
};
