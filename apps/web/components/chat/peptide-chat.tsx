'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@joice/ui';
import {
  streamPeptideRecommendation,
  useBrainClient,
  useBrainUi,
  type Citation,
} from '@joice/api-client';
import { buildChatHistory } from '@joice/brain/schemas';
import { brainUrl } from '@/lib/env';
import { AnswerMarkdown } from './answer-markdown';
import { useAudioLevel } from './use-audio-level';
import { useLiveTranscript } from './use-live-transcript';
import { useRecorder } from './use-recorder';
import { useSpeaker } from './use-speaker';
import { VoiceSun } from './voice-sun';
import { VoiceVisualizer } from './voice-visualizer';

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  error?: boolean;
}


function SpeakerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
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
 * Ask Joice. The page opens on a horizon at first light: the microphone is the
 * sun, and speaking raises the light behind the conversation. Typing is the
 * quiet second path underneath.
 */
export function PeptideChat() {
  const client = useBrainClient(); // chat and voice live on the brain service
  const brainUi = useBrainUi(); // admin-managed copy + citation visibility
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Cancels the in-flight answer; see the note in send(). */
  const askAbortRef = useRef<AbortController | null>(null);

  // Leaving the page must stop the generation, not just stop rendering it.
  useEffect(() => () => askAbortRef.current?.abort(), []);

  const speaker = useSpeaker();
  const live = useLiveTranscript();
  const recorder = useRecorder({
    onChunk: live.push,
    onAudio: (pcm) => void finishVoiceTurn(pcm),
    onError: (message) => {
      setVoiceHint(message);
      // toggleMic opens the transcription socket before the mic is granted, so
      // that live text starts the instant audio does. If the mic is then denied
      // — or nothing is said — that socket is billing AWS with nobody reading
      // it. Closing it here covers every way starting can fail.
      void live.finish();
    },
  });

  /**
   * Recording ended. Prefer the live transcript — it's already complete by the
   * time the member stops — and only fall back to uploading the whole clip if
   * the socket never worked.
   */
  async function finishVoiceTurn(pcm: Uint8Array) {
    const streamed = await live.finish();
    if (streamed) {
      await send(streamed, { viaVoice: true });
      return;
    }
    await transcribeAndAsk(pcm);
  }

  /**
   * Pressing the mic interrupts the assistant: otherwise its voice keeps
   * playing into the room and bleeds straight back into the recording.
   */
  const toggleMic = () => {
    if (recorder.recording) {
      recorder.stop();
      return;
    }
    speaker.stop();
    live.open(); // stream audio for live text; falls back silently if it can't
    void recorder.start();
  };

  // One rAF loop feeds the sun's corona and the horizon glow from live audio.
  useAudioLevel(rootRef, recorder.analyser ?? speaker.analyser);

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  async function transcribeAndAsk(pcm: Uint8Array) {
    setTranscribing(true);
    setVoiceHint(null);
    try {
      const res = await fetch(`${brainUrl}/api/brain/voice/transcribe`, {
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

    // One generation at a time. Aborting the previous one stops Bedrock billing
    // for an answer that has already been superseded or abandoned.
    askAbortRef.current?.abort();
    const abort = new AbortController();
    askAbortRef.current = abort;

    // Built from completed exchanges, not by trimming the visible thread —
    // see buildChatHistory for the two shapes that broke Bedrock.
    const history = buildChatHistory(messages, question);

    setInput('');
    setVoiceHint(null);
    setPending(true);
    // Computed here, not inside the updater: React may not have run the updater
    // yet when speaker.startStream reads this below, and a stale 0 meant the
    // stop button and speaking indicator attached to the wrong message and so
    // never appeared on a voice answer.
    const assistantIndex = messages.length + 1;
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: question },
      { role: 'assistant', content: '' },
    ]);
    scrollToEnd();

    const updateAssistant = (
      patch: Partial<DisplayMessage> | ((m: DisplayMessage) => DisplayMessage),
    ) => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1]!;
        next[next.length - 1] = typeof patch === 'function' ? patch(last) : { ...last, ...patch };
        return next;
      });
    };

    // Voice question → spoken answer (typed questions stay text-only). Speech
    // is fed sentence-by-sentence as the text arrives, so it starts talking
    // almost immediately instead of after the whole answer is written.
    if (opts.viaVoice) await speaker.startStream(`msg-${assistantIndex}`);

    try {
      for await (const event of streamPeptideRecommendation(client, history, abort.signal)) {
        if (event.type === 'delta') {
          updateAssistant((m) => ({ ...m, content: m.content + event.text }));
          if (opts.viaVoice) speaker.pushText(event.text);
        } else if (event.type === 'complete') {
          updateAssistant({
            content: event.recommendation.answer,
            citations: event.recommendation.citations,
          });
          if (opts.viaVoice) speaker.endStream();
        } else {
          updateAssistant({ content: event.error, error: true });
          if (opts.viaVoice) speaker.stop();
        }
        scrollToEnd();
      }
    } catch (error) {
      // An abort is us cancelling deliberately — leave the message alone.
      if ((error as Error)?.name !== 'AbortError') {
        console.warn('ask: stream failed', error);
        updateAssistant({ content: 'Something went wrong. Please try again.', error: true });
      }
      if (opts.viaVoice) speaker.stop();
    } finally {
      if (askAbortRef.current === abort) askAbortRef.current = null;
      if (opts.viaVoice) speaker.endStream(); // no-op if already ended
      setPending(false);
    }
  }

  const started = messages.length > 0;
  const busy = pending || transcribing;
  const sunState = recorder.recording
    ? 'listening'
    : recorder.arming
      ? 'arming'
      : busy
        ? 'busy'
        : 'idle';

  const status = recorder.arming
    ? 'Connecting microphone…'
    : recorder.recording
      ? `Listening — pause when you're done · ${recorder.elapsed}s`
      : transcribing
        ? 'Writing that down…'
        : pending
          ? 'Looking through the research…'
          : null;

  const composer = (
    <form
      className={cn('flex items-end gap-3', started && 'border-t border-line/70 px-4 py-4 sm:px-6')}
      onSubmit={(e) => {
        e.preventDefault();
        void send(input.trim());
      }}
    >
      {started ? (
        <VoiceSun
          state={sunState}
          size="sm"
          disabled={busy && !recorder.recording}
          onClick={() => toggleMic()}
        />
      ) : null}
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void send(input.trim());
          }
        }}
        rows={started ? 1 : 2}
        maxLength={2000}
        disabled={transcribing || recorder.recording}
        placeholder={recorder.recording && live.interim ? live.interim : brainUi.inputPlaceholder}
        aria-label="Type your question"
        className={cn(
          'min-h-11 flex-1 resize-none bg-transparent text-ink outline-none',
          'placeholder:text-muted/70 disabled:opacity-50',
          started ? 'py-2' : 'rounded-card bg-surface/70 px-5 py-3.5 shadow-[0_1px_0_0_rgba(255,255,255,0.9)_inset]',
        )}
      />
      <button
        type="submit"
        disabled={busy || recorder.recording || input.trim().length === 0}
        className={cn(
          'h-11 shrink-0 rounded-full px-5 text-sm font-medium transition-colors outline-none',
          'bg-ink text-canvas hover:bg-ink/90',
          'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          'disabled:cursor-not-allowed disabled:bg-ink/25',
        )}
      >
        {pending ? 'Asking…' : 'Ask'}
      </button>
    </form>
  );

  return (
    <div ref={rootRef} className="dawn flex flex-col items-center">
      {/* ---- Hero: the horizon ---- */}
      <header
        className={cn(
          'flex flex-col items-center text-center transition-all duration-700',
          started ? 'pt-10 pb-6' : 'pt-14 pb-6 sm:pt-20',
        )}
      >
        <span className="font-mono text-[10px] font-bold tracking-[0.28em] text-brand-700 uppercase">
          Ask Joice
        </span>

        {!started ? (
          <>
            <h1 className="mt-6 max-w-3xl text-balance text-5xl leading-[0.98] font-extralight tracking-[-0.035em] text-ink sm:text-7xl">
              Ask it{' '}
              <span className="font-medium text-[var(--dawn-ember-deep)] italic">out loud</span>.
            </h1>
            <p className="mt-6 max-w-md text-pretty leading-relaxed text-muted">
              {brainUi.emptyStateHint}
            </p>
          </>
        ) : (
          <h1 className="sr-only">Ask Joice</h1>
        )}

        {/* The sun rising out of the horizon — the primary way in. */}
        {!started ? (
          <div className="relative mt-14 flex w-full justify-center">
            <span className="horizon" aria-hidden="true" />
            <VoiceSun
              state={sunState}
              disabled={busy && !recorder.recording}
              onClick={() => toggleMic()}
            />
          </div>
        ) : null}

        {!started ? (
          <div className="mt-5 flex min-h-24 w-full max-w-2xl flex-col items-center gap-3 px-4">
            {recorder.recording ? (
              <VoiceVisualizer
                analyser={recorder.analyser}
                className="h-6 w-56 text-[var(--dawn-ember-deep)]"
              />
            ) : null}
            {/* The words as they are spoken. */}
            {live.interim ? (
              <p className="max-w-xl text-balance text-lg leading-relaxed text-ink" aria-live="polite">
                {live.interim}
              </p>
            ) : (
              <p
                aria-live="polite"
                className={cn(
                  'font-mono text-[10px] tracking-[0.22em] uppercase',
                  status ? 'text-[var(--dawn-ember-deep)]' : 'text-muted',
                )}
              >
                {status ?? 'Press to speak'}
              </p>
            )}
          </div>
        ) : null}
      </header>

      {/* ---- Conversation ---- */}
      <div
        className={cn(
          'w-full max-w-3xl transition-all duration-500',
          started &&
            'rounded-card bg-surface/85 shadow-[0_1px_0_0_rgba(255,255,255,0.9)_inset,0_30px_70px_-40px_rgba(60,45,25,0.35)] backdrop-blur-xl',
        )}
      >
        {started ? (
          <div
            ref={scrollRef}
            className="flex max-h-[52vh] flex-col gap-6 overflow-y-auto scroll-pt-6 px-4 py-7 sm:px-6"
          >
            {messages.map((message, i) => {
              const messageId = `msg-${i}`;
              const isSpeaking = speaker.speakingId === messageId;
              return (
                <div key={i} className={message.role === 'user' ? 'self-end' : 'self-start'}>
                  {message.role === 'user' ? (
                    <div className="max-w-md rounded-card rounded-br-lg bg-ink px-4 py-3 text-canvas">
                      {message.content}
                    </div>
                  ) : message.error ? (
                    <div className="max-w-2xl rounded-card bg-red-50 px-4 py-3 text-red-800">
                      {message.content}
                    </div>
                  ) : (
                    <div className="max-w-2xl">
                      {message.content ? (
                        <AnswerMarkdown>{message.content}</AnswerMarkdown>
                      ) : (
                        <p className="font-mono text-[10px] tracking-[0.22em] text-muted uppercase">
                          Looking through the research…
                        </p>
                      )}
                    </div>
                  )}

                  {message.role === 'assistant' && message.content && !message.error ? (
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          isSpeaking
                            ? speaker.stop()
                            : void speaker.speak(message.content, messageId)
                        }
                        aria-label={isSpeaking ? 'Stop reading answer' : 'Read answer aloud'}
                        className="rounded-full p-1.5 text-muted transition-colors hover:bg-brand-400/15 hover:text-[var(--dawn-ember-deep)] focus-visible:ring-2 focus-visible:ring-brand-500 outline-none"
                      >
                        {isSpeaking ? <StopIcon className="h-4 w-4" /> : <SpeakerIcon className="h-4 w-4" />}
                      </button>
                      {isSpeaking ? (
                        <VoiceVisualizer
                          analyser={speaker.analyser}
                          className="h-5 w-28 text-[var(--dawn-ember-deep)]"
                        />
                      ) : null}
                    </div>
                  ) : null}

                  {brainUi.showCitations && message.citations && message.citations.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {message.citations.map((citation) => (
                        <li
                          key={citation.index}
                          title={citation.citedText}
                          className="rounded-full bg-brand-400/12 px-3 py-1 font-mono text-[10px] tracking-[0.1em] text-brand-800 uppercase"
                        >
                          [{citation.index}]{' '}
                          {citation.headingPath ?? citation.sourcePath.replace(/\.md$/, '')}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Composer: quiet second path below the horizon when idle. */}
        {started ? (
          composer
        ) : (
          <div className="mx-auto max-w-xl px-4">
            <p className="mb-2.5 text-center font-mono text-[10px] tracking-[0.22em] text-muted/70 uppercase">
              or type instead
            </p>
            {composer}
          </div>
        )}

        {started && status ? (
          <p
            aria-live="polite"
            className="px-6 pb-4 font-mono text-[10px] tracking-[0.22em] text-[var(--dawn-ember-deep)] uppercase"
          >
            {status}
          </p>
        ) : null}
      </div>

      {voiceHint ? (
        <p className="mt-4 max-w-md text-center text-sm text-muted" role="status">
          {voiceHint}
        </p>
      ) : null}

      {/* ---- What makes the answers trustworthy ---- */}
      <ul className="mt-14 mb-6 grid w-full max-w-3xl gap-px overflow-hidden rounded-card bg-line/60 sm:grid-cols-3">
        {[
          ['Grounded', 'Answers come from our clinical team’s research library.'],
          ['Sourced', 'Every claim shows the study it came from.'],
          ['Honest', 'If the research doesn’t cover it, it says so.'],
        ].map(([label, detail]) => (
          <li key={label} className="bg-canvas/80 px-5 py-4 backdrop-blur-sm">
            <span className="font-mono text-[10px] font-bold tracking-[0.22em] text-[var(--dawn-ember-deep)] uppercase">
              {label}
            </span>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{detail}</p>
          </li>
        ))}
      </ul>

      <p className="pb-16 text-center font-mono text-[10px] tracking-[0.2em] text-muted/80 uppercase">
        {brainUi.disclaimer}
      </p>
    </div>
  );
}
