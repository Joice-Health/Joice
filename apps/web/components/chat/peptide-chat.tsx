'use client';

import { useRef, useState } from 'react';
import { Button } from '@joice/ui';
import {
  streamPeptideRecommendation,
  useApiClient,
  type ChatMessage,
  type Citation,
} from '@joice/api-client';
import { Eyebrow } from '@/components/ui/eyebrow';

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  error?: boolean;
}

/** Schema cap on the API: at most 20 messages per request. */
const MAX_HISTORY = 20;

/**
 * The member-facing RAG chat: streams the answer over SSE, then swaps in the
 * final citation-annotated text (the `complete` event is authoritative — the
 * raw deltas carry no [n] footnote markers).
 */
export function PeptideChat() {
  const client = useApiClient();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  };

  async function send() {
    const question = input.trim();
    if (!question || pending) return;

    const full: ChatMessage[] = [
      ...messages
        .filter((m) => !m.error)
        .map(({ role, content }): ChatMessage => ({ role, content })),
      { role: 'user', content: question },
    ];
    const history = full.slice(-MAX_HISTORY);

    setInput('');
    setPending(true);
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: question },
      { role: 'assistant', content: '' },
    ]);
    scrollToEnd();

    const updateAssistant = (patch: Partial<DisplayMessage> | ((m: DisplayMessage) => DisplayMessage)) => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1]!;
        next[next.length - 1] = typeof patch === 'function' ? patch(last) : { ...last, ...patch };
        return next;
      });
    };

    try {
      for await (const event of streamPeptideRecommendation(client, history)) {
        if (event.type === 'delta') {
          updateAssistant((m) => ({ ...m, content: m.content + event.text }));
        } else if (event.type === 'complete') {
          updateAssistant({
            content: event.recommendation.answer,
            citations: event.recommendation.citations,
          });
        } else {
          updateAssistant({ content: event.error, error: true });
        }
        scrollToEnd();
      }
    } catch {
      updateAssistant({ content: 'Something went wrong. Please try again.', error: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col rounded-card bg-surface shadow-[0_20px_50px_-24px_rgba(31,38,32,0.25)]">
      <div ref={scrollRef} className="flex max-h-[60vh] min-h-72 flex-col gap-4 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <div className="m-auto max-w-sm text-center">
            <Eyebrow>Ask Joice</Eyebrow>
            <p className="mt-3 text-pretty text-muted">
              Ask anything about the peptides and protocols in our clinical notes —
              answers cite the exact source they came from.
            </p>
          </div>
        ) : (
          messages.map((message, i) => (
            <div key={i} className={message.role === 'user' ? 'self-end' : 'self-start'}>
              <div
                className={
                  message.role === 'user'
                    ? 'max-w-md rounded-card bg-gradient-to-b from-brand-500 to-brand-600 px-4 py-3 text-white'
                    : message.error
                      ? 'max-w-2xl rounded-card bg-red-50 px-4 py-3 text-red-800'
                      : 'max-w-2xl whitespace-pre-wrap px-1 py-2 leading-relaxed text-ink'
                }
              >
                {message.content || (pending && i === messages.length - 1 ? 'Thinking…' : '')}
              </div>
              {message.citations && message.citations.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2 px-1">
                  {message.citations.map((citation) => (
                    <li
                      key={citation.index}
                      title={citation.citedText}
                      className="rounded-full bg-brand-400/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-brand-800"
                    >
                      [{citation.index}] {citation.headingPath ?? citation.sourcePath.replace(/\.md$/, '')}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
      </div>

      <form
        className="flex items-end gap-3 border-t border-line p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="e.g. What does the clinical team say about BPC-157 dosing?"
          className="min-h-11 flex-1 resize-none rounded-card bg-canvas px-4 py-3 text-ink outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand-400"
        />
        <Button type="submit" disabled={pending || input.trim().length === 0}>
          {pending ? 'Answering…' : 'Ask'}
        </Button>
      </form>

      <p className="px-6 pb-4 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
        Educational information from our clinical notes — not medical advice
      </p>
    </div>
  );
}
