'use client';

import { useRef, useState } from 'react';
import { Button } from '@joice/ui';
import {
  streamPeptideRecommendation,
  useApiClient,
  useBrainUi,
  type ChatMessage,
  type Citation,
} from '@joice/api-client';
import { Eyebrow } from '@/components/ui/eyebrow';
import { apiUrl } from '@/lib/env';
import { AnswerMarkdown } from './answer-markdown';
import { useRecorder } from './use-recorder';
import { useSpeaker } from './use-speaker';
import { VoiceVisualizer } from './voice-visualizer';

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  error?: boolean;
}

/** Schema cap on the API: at most 20 messages per request. */
const MAX_HISTORY = 20;

/** What Polly reads aloud — footnote markers are noise when spoken. */
const speakable = (text: string) => text.replace(/\[\d+\]/g, '').replace(/\s{2,}/g, ' ').trim();

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className} aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function SpeakerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M11 5 6.5 8.5H3v7h3.5L11 19V5Z" />
      <path d="M15 9a4.2 4.2 0 0 1 0 6M17.5 6.5a8 8 0 0 1 0 11" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

/**
 * The member-facing RAG chat. Text: streams the answer over SSE, then swaps in
 * the final citation-annotated text. Voice: mic → Transcribe → the same SSE
 * pipeline → the answer is spoken back (Polly) with a visualizer driven by the
 * real audio. Every assistant message also has a play button.
 */
export function PeptideChat() {
  const client = useApiClient();
  const brainUi = useBrainUi(); // admin-managed copy + citation visibility
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const speaker = useSpeaker();
  const recorder = useRecorder({
    onAudio: (pcm) => void transcribeAndAsk(pcm),
    onError: (message) => setVoiceHint(message),
  });

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  };

  async function transcribeAndAsk(pcm: Uint8Array) {
    setTranscribing(true);
    setVoiceHint(null);
    try {
      const res = await fetch(`${apiUrl}/api/voice/transcribe`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: pcm.slice().buffer,
      });
      if (!res.ok) throw new Error(`transcribe failed (${res.status})`);
      const { transcript } = (await res.json()) as { transcript: string };
      if (!transcript) {
        setVoiceHint("Didn't catch that — try again a little closer to the mic.");
        return;
      }
      await send(transcript, { viaVoice: true });
    } catch {
      setVoiceHint('Voice is unavailable right now — you can still type your question.');
    } finally {
      setTranscribing(false);
    }
  }

  async function send(question: string, opts: { viaVoice?: boolean } = {}) {
    if (!question || pending) return;
    speaker.stop();

    const full: ChatMessage[] = [
      ...messages
        .filter((m) => !m.error)
        .map(({ role, content }): ChatMessage => ({ role, content })),
      { role: 'user', content: question },
    ];
    const history = full.slice(-MAX_HISTORY);

    setInput('');
    setVoiceHint(null);
    setPending(true);
    let assistantIndex = 0;
    setMessages((prev) => {
      assistantIndex = prev.length + 1;
      return [...prev, { role: 'user', content: question }, { role: 'assistant', content: '' }];
    });
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
          // Voice question → spoken answer (typed questions stay text-only).
          if (opts.viaVoice) {
            void speaker.speak(speakable(event.recommendation.answer), `msg-${assistantIndex}`);
          }
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

  const busy = pending || transcribing;

  return (
    <div className="flex flex-col rounded-card bg-surface shadow-[0_20px_50px_-24px_rgba(31,38,32,0.25)]">
      <div ref={scrollRef} className="flex max-h-[60vh] min-h-72 flex-col gap-4 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <div className="m-auto max-w-sm text-center">
            <Eyebrow>Ask Joice</Eyebrow>
            <p className="mt-3 text-pretty text-muted">{brainUi.emptyStateHint}</p>
          </div>
        ) : (
          messages.map((message, i) => {
            const messageId = `msg-${i}`;
            const isSpeaking = speaker.speakingId === messageId;
            return (
              <div key={i} className={message.role === 'user' ? 'self-end' : 'self-start'}>
                <div
                  className={
                    message.role === 'user'
                      ? 'max-w-md rounded-card bg-gradient-to-b from-brand-500 to-brand-600 px-4 py-3 text-white'
                      : message.error
                        ? 'max-w-2xl rounded-card bg-red-50 px-4 py-3 text-red-800'
                        : 'max-w-2xl px-1 py-2'
                  }
                >
                  {message.role === 'assistant' && message.content && !message.error ? (
                    // Answers are markdown (bold, lists, occasional tables).
                    <AnswerMarkdown>{message.content}</AnswerMarkdown>
                  ) : (
                    <span className="whitespace-pre-wrap leading-relaxed">
                      {message.content || (pending && i === messages.length - 1 ? 'Thinking…' : '')}
                    </span>
                  )}
                </div>

                {message.role === 'assistant' && message.content && !message.error ? (
                  <div className="mt-1 flex items-center gap-2 px-1">
                    <button
                      type="button"
                      onClick={() =>
                        isSpeaking ? speaker.stop() : void speaker.speak(speakable(message.content), messageId)
                      }
                      aria-label={isSpeaking ? 'Stop reading answer' : 'Read answer aloud'}
                      className="rounded-full p-1.5 text-muted transition-colors hover:bg-brand-400/15 hover:text-brand-700"
                    >
                      {isSpeaking ? <StopIcon className="h-4 w-4" /> : <SpeakerIcon className="h-4 w-4" />}
                    </button>
                    {isSpeaking ? (
                      <VoiceVisualizer analyser={speaker.analyser} className="h-6 w-36 text-brand-600" />
                    ) : null}
                  </div>
                ) : null}

                {brainUi.showCitations && message.citations && message.citations.length > 0 ? (
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
            );
          })
        )}
      </div>

      {voiceHint ? (
        <p className="px-6 pt-2 text-sm text-muted">{voiceHint}</p>
      ) : null}

      <form
        className="flex items-end gap-3 border-t border-line p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input.trim());
        }}
      >
        {recorder.recording || recorder.arming ? (
          <div className="flex min-h-11 flex-1 items-center gap-3 rounded-card bg-canvas px-4 py-3">
            <VoiceVisualizer
              analyser={recorder.recording ? recorder.analyser : null}
              className={`h-8 flex-1 text-brand-600 ${recorder.arming ? 'animate-pulse opacity-50' : ''}`}
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              {recorder.arming ? 'Connecting mic…' : `Listening · pause to send · ${recorder.elapsed}s`}
            </span>
          </div>
        ) : (
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input.trim());
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder={transcribing ? 'Transcribing…' : brainUi.inputPlaceholder}
            disabled={transcribing}
            className="min-h-11 flex-1 resize-none rounded-card bg-canvas px-4 py-3 text-ink outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-60"
          />
        )}

        <Button
          type="button"
          variant={recorder.recording ? 'primary' : 'glass'}
          onClick={() => (recorder.recording ? recorder.stop() : void recorder.start())}
          disabled={busy || recorder.arming}
          aria-label={recorder.recording ? 'Stop recording' : 'Ask by voice'}
          className="px-4"
        >
          {recorder.recording ? <StopIcon className="h-5 w-5" /> : <MicIcon className="h-5 w-5" />}
        </Button>

        <Button
          type="submit"
          disabled={busy || recorder.recording || recorder.arming || input.trim().length === 0}
        >
          {pending ? 'Answering…' : 'Ask'}
        </Button>
      </form>

      <p className="px-6 pb-4 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
        {brainUi.disclaimer}
      </p>
    </div>
  );
}
