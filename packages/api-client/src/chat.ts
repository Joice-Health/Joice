'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { ChatMessage, PeptideRecommendation } from '@joice/core';
// Value import must use the browser-safe subpath (the barrel pulls in the pg driver).
import { BRAIN_UI_DEFAULTS, type BrainUi } from '@joice/core/schemas';
import { useApiClient } from './provider';
import { publicBrainKeys } from './admin/hooks';
import type { ApiClient } from './client';

/**
 * Peptide chatbot client bindings. The JSON endpoint flows through the typed
 * hc client + TanStack like everything else; the SSE stream endpoint is also
 * called through the typed client, but its Response body is read manually —
 * hooks can't consume server-sent events.
 */

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/**
 * Public-safe brain config for the /ask page (copy + citation visibility).
 * Falls back to code defaults while loading; admin changes land within ~30s.
 */
export function useBrainUi(): BrainUi {
  const client = useApiClient();
  const { data } = useQuery({
    queryKey: publicBrainKeys.all,
    staleTime: 30_000,
    queryFn: async (): Promise<BrainUi> => unwrap(await client.api.brain.$get()),
  });
  return data ?? BRAIN_UI_DEFAULTS;
}

/** One-shot (non-streaming) answer — for non-chat surfaces. */
export function usePeptideRecommendation() {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (messages: ChatMessage[]): Promise<PeptideRecommendation> => {
      const res = await client.api['peptide-recommendations'].$post({ json: { messages } });
      return unwrap<PeptideRecommendation>(res);
    },
  });
}

export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'complete'; recommendation: PeptideRecommendation }
  | { type: 'error'; error: string };

/**
 * Streamed answer for the chat UI: yields text deltas as Claude generates,
 * then a final `complete` event whose recommendation carries the citation-
 * annotated answer (render that as the authoritative message).
 */
export async function* streamPeptideRecommendation(
  client: ApiClient,
  messages: ChatMessage[],
): AsyncGenerator<ChatStreamEvent> {
  const res = await client.api['peptide-recommendations'].stream.$post({ json: { messages } });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    yield { type: 'error', error: body.error ?? `Request failed (${res.status})` };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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
      } else if (event === 'complete') {
        yield { type: 'complete', recommendation: JSON.parse(data) as PeptideRecommendation };
      } else if (event === 'error') {
        yield { type: 'error', error: (JSON.parse(data) as { error: string }).error };
      }
    }
  }
}
