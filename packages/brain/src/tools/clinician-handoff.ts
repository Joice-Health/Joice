import { z } from 'zod';
import { HANDOFF_REASONS } from '../conversation/schemas';
import { invalidInput, type BrainTool } from './types';

// Spec and zod schema describe the same contract and move together.
const handoffInput = z.object({ reason: z.enum(HANDOFF_REASONS) });

export const clinicianHandoffTool: BrainTool = {
  label: 'Looping in the clinical team…',
  spec: {
    name: 'request_clinician_handoff',
    description:
      "Show the member a card to connect with Joice's licensed clinical team. Call this when " +
      'a question needs individual medical judgment — dosing for their specific situation, ' +
      'their symptoms or conditions, interactions with their medications — or when they ask ' +
      'to talk to a person. Pick the closest reason.',
    inputSchema: {
      type: 'object',
      properties: { reason: { type: 'string', enum: [...HANDOFF_REASONS] } },
      required: ['reason'],
    },
  },
  create() {
    return async (raw) => {
      const input = handoffInput.safeParse(raw);
      if (!input.success) return invalidInput(`{ "reason": one of ${HANDOFF_REASONS.join(' | ')} }`);
      return {
        resultText:
          'The member has been shown a card to connect with the clinical team. Give a brief ' +
          'grounded answer if the documents support one, and defer the individual specifics ' +
          'to the team.',
        action: { kind: 'handoff', reason: input.data.reason },
      };
    };
  },
};
