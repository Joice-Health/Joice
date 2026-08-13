'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
// Value imports must use the browser-safe subpath (the barrel pulls in the pg
// driver and the AWS SDK).
import {
  BRAIN_UI_DEFAULTS,
  type BrainUi,
  type ChatAction,
  type ChatMessage,
  type PeptideRecommendation,
  type StoredConversationView,
} from '@joice/brain/schemas';
import { useBrainClient } from './provider';
import { publicBrainKeys } from './admin/hooks';
import type { BrainClient } from './client';

/**
 * Brain-service client bindings. The JSON endpoint flows through the typed hc
 * client + TanStack like everything else; the SSE stream endpoint is also
 * called through the typed client, but its Response body is read manually —
 * hooks can't consume server-sent events.
 *
 * These talk to the brain service (`useBrainClient`), not the api service.
 */

/**
 * Error bodies aren't always `{error: string}` — zValidator 400s carry a zod
 * issue OBJECT under `error`, and rendering an object as a React child crashes
 * the page. Only ever surface strings.
 */
function errorMessage(body: unknown, status: number): string {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === 'string' ? error : `Request failed (${status})`;
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new Error(errorMessage(body, res.status));
  }
  return res.json() as Promise<T>;
}

/**
 * Public-safe brain config for the /ask page (copy + citation visibility).
 * Falls back to code defaults while loading; admin changes land within ~30s.
 */
export function useBrainUi(): BrainUi {
  const client = useBrainClient();
  const { data } = useQuery({
    queryKey: publicBrainKeys.all,
    staleTime: 30_000,
    queryFn: async (): Promise<BrainUi> => unwrap(await client.api.brain.config.$get()),
  });
  return data ?? BRAIN_UI_DEFAULTS;
}

/**
 * The visitor's most recent stored thread, for "pick up where you left off".
 * Only fires when the server says persistence is on (`brainUi.historyEnabled`)
 * — the session cookie is the key, so no ids ride the client. Null when there
 * is no history yet.
 */
export function useLatestConversation(enabled: boolean) {
  const client = useBrainClient();
  return useQuery({
    queryKey: ['brain', 'conversations', 'latest'],
    enabled,
    staleTime: Infinity, // hydrate once per page load; new turns live in state
    queryFn: async (): Promise<StoredConversationView | null> => {
      const list = await unwrap<Array<{ id: string }>>(
        await client.api.brain.conversations.$get(),
      );
      const latest = list[0];
      if (!latest) return null;
      const res = await client.api.brain.conversations[':id'].$get({
        param: { id: latest.id },
      });
      if (res.status === 404) return null;
      return unwrap<StoredConversationView>(res);
    },
  });
}

/** One-shot (non-streaming) answer — for non-chat surfaces. */
export function usePeptideRecommendation() {
  const client = useBrainClient();

  return useMutation({
    mutationFn: async (messages: ChatMessage[]): Promise<PeptideRecommendation> => {
      const res = await client.api.brain.chat.$post({ json: { messages } });
      return unwrap<PeptideRecommendation>(res);
    },
  });
}

export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  /** Tool activity (tools mode): show `label` as a transient status line. */
  | { type: 'tool'; name: string; status: 'started' | 'finished'; label: string }
  /** A UI signal a tool raised — handoff card, conversion-timing nudge. */
  | { type: 'action'; action: ChatAction }
  | { type: 'complete'; recommendation: PeptideRecommendation }
  | { type: 'error'; error: string };

/**
 * Streamed answer for the chat UI: yields text deltas as Claude generates,
 * then a final `complete` event whose recommendation carries the citation-
 * annotated answer (render that as the authoritative message).
 */
export async function* streamPeptideRecommendation(
  client: BrainClient,
  messages: ChatMessage[],
  /**
   * Abort the request. Pass this whenever the answer can stop mattering — the
   * member navigating away, asking something else, or hitting stop. Generation
   * is billed per token whether or not anyone is still reading.
   */
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const res = await client.api.brain.chat.stream.$post(
    { json: { messages } },
    { init: { signal } },
  );
  if (!res.ok || !res.body) {
    const body: unknown = await res.json().catch(() => null);
    yield { type: 'error', error: errorMessage(body, res.status) };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        let event = 'message';
        let data = '';
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data) continue;

        if (event === 'delta') {
          yield { type: 'delta', text: (JSON.parse(data) as { text: string }).text };
        } else if (event === 'tool') {
          yield {
            type: 'tool',
            ...(JSON.parse(data) as { name: string; status: 'started' | 'finished'; label: string }),
          };
        } else if (event === 'action') {
          yield { type: 'action', action: JSON.parse(data) as ChatAction };
        } else if (event === 'complete') {
          yield { type: 'complete', recommendation: JSON.parse(data) as PeptideRecommendation };
        } else if (event === 'error') {
          yield { type: 'error', error: (JSON.parse(data) as { error: string }).error };
        }
      }
    }
  } finally {
    // Runs on early `break`/`return` by the consumer too. Without it the body
    // stayed open and the server kept generating an answer nobody would read.
    await reader.cancel().catch(() => {});
  }
}
