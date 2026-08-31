'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, buttonClasses, cn } from '@joice/ui';
import { Eyebrow } from '@/components/ui/eyebrow';
import {
  FieldError,
  streamPeptideRecommendation,
  useBrainClient,
  useBrainUi,
  useCompanionProfile,
  useLatestConversation,
  useSubmitProfileField,
  type Citation,
  type ToolUseTrace,
} from '@joice/api-client';
import {
  buildChatHistory,
  matchCareArea,
  type CaptureStep,
  type CompanionActionResult,
} from '@joice/brain/schemas';
import { track } from '@/lib/analytics';
import { brainUrl } from '@/lib/env';
import { AnswerMarkdown } from './answer-markdown';
import { GoalChips, SuggestionChips } from './capture-widgets';
import { useAudioLevel } from './use-audio-level';
import { useLiveTranscript } from './use-live-transcript';
import { useRecorder } from './use-recorder';
import { useSpeaker } from './use-speaker';
import { VoiceMic } from './voice-mic';
import { VoiceVisualizer } from './voice-visualizer';

/**
 * A turn in the transcript. Knowledge Q&A and the companion's own lines share
 * one surface: `text` is a knowledge turn (part of the LLM history), `capture`
 * is a companion line or the visitor's answer to one (rendered identically but
 * NEVER sent to the model — a typed email in the history is PII to Bedrock and
 * noise to retrieval), and `cta` is the conversion offer.
 */
export type DisplayMessage =
  | {
      kind: 'text';
      role: 'user' | 'assistant';
      content: string;
      citations?: Citation[];
      toolsUsed?: ToolUseTrace[];
      error?: boolean;
    }
  | { kind: 'capture'; role: 'user' | 'assistant'; content: string }
  | { kind: 'cta'; role: 'assistant'; content: string; ctaLabel: string }
  /**
   * The clinician-handoff card. Deliberately NOT a `cta`: its button only
   * navigates — no profile write, no conversion tracking. A visitor clicking
   * "talk to the clinical team" about a medication interaction is not
   * confirming they want to start a membership journey.
   */
  | { kind: 'handoff'; role: 'assistant'; content: string; ctaLabel: string };

type TextMessage = Extract<DisplayMessage, { kind: 'text' }>;

/** Is this the visitor asking a question rather than answering the companion? */
function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (t.endsWith('?')) return true;
  return /^(what|how|why|is|are|can|could|does|do|should|which|when|where|who|tell me|explain)\b/i.test(
    t,
  );
}

/** Typed "skip"-style answers that step past the current capture question. */
function isSkip(text: string): boolean {
  return /^(skip|no thanks?|not now|pass|later|maybe later)\.?$/i.test(text.trim());
}

/**
 * Deterministic buying-signal detector — no model call. Kept narrow so an
 * ordinary "how do I dose BPC" doesn't read as intent to purchase.
 */
function isBuyingSignal(text: string): boolean {
  return /\b(sign ?up|get started|getting started|start my|begin my|how do i (start|begin|sign ?up|join|get started)|ready to (start|begin|sign ?up|join)|how much|cost|price|pricing|order|purchase|consult|appointment|book a)\b/i.test(
    text,
  );
}

/**
 * How many answered questions the visitor gets before the companion starts
 * asking its own — value first. 2 means capture begins after the second answer.
 */
const CAPTURE_AFTER_EXCHANGES = 2;

/** How many total exchanges before the journey is offered regardless of capture. */
const CONVERSION_EXCHANGE_THRESHOLD = 4;

/**
 * Knowledge detours after a capture prompt before it's gently re-anchored
 * (once per field). One detour is enough: a pending question that scrolled
 * away behind an answer reads as never asked, and a typed reply to it then
 * goes to the model as a question instead of into the profile.
 */
const REOFFER_AFTER_DETOURS = 1;

/** Minimum exchanges between conversion offers — a re-offer must not nag. */
const CTA_REOFFER_EXCHANGES = 2;

/**
 * Starter questions offered the moment capture completes, tailored to the
 * goal the visitor just picked. The highest-intent moment in the whole
 * conversation must not end on a full stop ("I'll keep that front of mind.")
 * with nothing to do next. Phrased to retrieve broadly from the corpus;
 * tune alongside the live vault, and a candidate for admin config later.
 */
const GOAL_FOLLOW_UPS: Record<string, string[]> = {
  'weight-metabolic': [
    'How does tirzepatide support weight loss?',
    'What do the clinical notes say about metabolism and peptides?',
  ],
  'body-comp-recovery': [
    'What does the research say about BPC-157 for recovery?',
    'Can BPC-157 and TB-500 be taken together?',
  ],
  'beauty-skin': [
    'What does GHK-Cu do for skin?',
    'What does the research say about peptides for collagen?',
  ],
  energy: [
    'What does the research say about NAD for energy?',
    'How does MOTS-c affect metabolic energy?',
  ],
  'stress-sleep': [
    'What is DSIP and how does it affect sleep?',
    'What does the research say about deep sleep?',
  ],
  'not-sure': [
    'What are peptides, in plain language?',
    'Where do most people start?',
  ],
};


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
 * Ask Joice. The page opens on the microphone, drawn as the house button made
 * round; speaking moves its rings. Typing is the quiet second path underneath.
 */
export function PeptideChat() {
  const client = useBrainClient(); // chat and voice live on the brain service
  const brainUi = useBrainUi(); // admin-managed copy + citation visibility
  const router = useRouter();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  /** Server-labelled tool activity ("Checking the catalogue…"), tools mode only. */
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  /** Goal-tailored starter questions shown after capture completes; one tap asks. */
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Cancels the in-flight answer; see the note in send(). */
  const askAbortRef = useRef<AbortController | null>(null);

  // The pre-onboarding companion: capture state (which field to ask next) lives
  // server-side, keyed to the session cookie, so it resumes across reloads.
  const { data: companion } = useCompanionProfile();
  const submitField = useSubmitProfileField();
  /** True once the companion has begun asking its questions (after the 1st answer). */
  const captureStartedRef = useRef(false);
  /** Knowledge answers since the pending field was last asked — 0 right after. */
  const detoursSincePromptRef = useRef(0);
  /** Fields already re-anchored once — a second re-ask would be nagging. */
  const reofferedFieldsRef = useRef(new Set<string>());
  /** Completed knowledge exchanges this session — drives the conversion timing. */
  const exchangeCountRef = useRef(0);
  /** exchangeCount at the moment capture finished, or null until it does. */
  const exchangesAtCaptureDoneRef = useRef<number | null>(null);
  /** Set on intent-heavy input; consumed when a conversion offer is shown. */
  const buyingSignalRef = useRef(false);
  /** One-time guard for seeding return-visitor state. */
  const initRef = useRef(false);
  /** exchangeCount when the offer was last shown, or null if never. */
  const ctaShownAtExchangeRef = useRef<number | null>(null);
  /** One handoff card per page load — the model may ask repeatedly; we don't. */
  const handoffShownRef = useRef(false);
  /** True once the transcript was restored from the server (history mode). */
  const resumedThreadRef = useRef(false);
  /** One-shot guard for hydration — it must never clobber a live conversation. */
  const hydratedRef = useRef(false);

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
      // Through the same router as typing: a spoken name at the name step is a
      // capture answer, not a Bedrock question — the PII-out-of-history rule
      // has to hold for the page's headline interaction too.
      routeCaptureOrAsk(streamed.trim(), { viaVoice: true });
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

  // One rAF loop feeds the mic's rings from live audio.
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
        setVoiceHint("Didn't catch that. Try again a little closer to the mic.");
        return;
      }
      routeCaptureOrAsk(transcript.trim(), { viaVoice: true });
    } catch {
      setVoiceHint('Voice is unavailable right now, but you can still type your question.');
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

    // Built from completed exchanges, not by trimming the visible thread — and
    // only from `text` turns. Capture turns are excluded on purpose: a typed
    // name or email in the history is PII shipped to Bedrock and noise in the
    // retrieval rewrite. CTA turns aren't conversation at all.
    const textTurns = messages.filter((m): m is TextMessage => m.kind === 'text');
    const history = buildChatHistory(textTurns, question);

    if (messages.length === 0) track({ event: 'chat_started' });
    track({
      event: 'chat_question_asked',
      viaVoice: Boolean(opts.viaVoice),
      exchangeIndex: exchangeCountRef.current + 1,
    });

    setInput('');
    setVoiceHint(null);
    setSuggestions(null); // the conversation moved on; starter chips are done
    setPending(true);
    // Computed here, not inside the updater: React may not have run the updater
    // yet when speaker.startStream reads this below, and a stale 0 meant the
    // stop button and speaking indicator attached to the wrong message and so
    // never appeared on a voice answer.
    const assistantIndex = messages.length + 1;
    setMessages((prev) => [
      ...prev,
      { kind: 'text', role: 'user', content: question },
      { kind: 'text', role: 'assistant', content: '' },
    ]);
    scrollToEnd();

    const updateAssistant = (
      patch: Partial<TextMessage> | ((m: TextMessage) => TextMessage),
    ) => {
      setMessages((prev) => {
        const next = [...prev];
        // Patch the answer turn by its index, never the tail: a capture turn
        // (chip tap, skip) can append while the answer is still streaming, and
        // a tail-based patch would silently truncate the answer at that point.
        const target = next[assistantIndex];
        if (!target || target.kind !== 'text') return prev;
        next[assistantIndex] = typeof patch === 'function' ? patch(target) : { ...target, ...patch };
        return next;
      });
    };

    // Voice question + spoken answer (typed questions stay text-only). Speech
    // is fed sentence-by-sentence as the text arrives, so it starts talking
    // almost immediately instead of after the whole answer is written.
    if (opts.viaVoice) await speaker.startStream(`msg-${assistantIndex}`);

    // Only a real answer advances the companion — a failed turn shouldn't be
    // followed by "Love that you're digging in!".
    let answeredOk = false;

    try {
      for await (const event of streamPeptideRecommendation(client, history, abort.signal)) {
        if (event.type === 'delta') {
          updateAssistant((m) => ({ ...m, content: m.content + event.text }));
          if (opts.viaVoice) speaker.pushText(event.text);
        } else if (event.type === 'tool') {
          setToolStatus(event.status === 'started' && event.label ? event.label : null);
        } else if (event.type === 'action') {
          if (event.action.kind === 'handoff') {
            // The model asked for the clinical team — one card per page load,
            // woven in below the streaming answer.
            if (!handoffShownRef.current) {
              handoffShownRef.current = true;
              setMessages((prev) => [
                ...prev,
                {
                  kind: 'handoff',
                  role: 'assistant',
                  content:
                    'This one deserves a clinician’s eyes on your specifics. I can connect you with the team.',
                  ctaLabel: 'Talk to the clinical team',
                },
              ]);
            }
          } else {
            // Intent nudge: treated exactly like a typed buying signal — the
            // offer is considered once the answer completes.
            buyingSignalRef.current = true;
          }
        } else if (event.type === 'complete') {
          answeredOk = true;
          track({
            event: 'chat_answer_completed',
            hadCitations: event.recommendation.citations.length > 0,
          });
          updateAssistant({
            content: event.recommendation.answer,
            citations: event.recommendation.citations,
            toolsUsed: event.recommendation.toolsUsed,
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
      setToolStatus(null);

      // A failed turn doesn't count — no capture, no conversion off the back of
      // an error message. (An early `return` here trips no-unsafe-finally.)
      if (answeredOk) {
        exchangeCountRef.current += 1;
        if (isBuyingSignal(question)) buyingSignalRef.current = true;

        // Value first: the companion holds its questions until the visitor has
        // had a couple of real answers. Once started, each knowledge answer
        // while a field is pending counts as a detour; after a couple of those
        // the pending field is gently re-anchored. Then consider the journey.
        if (!captureStartedRef.current) {
          if (companion?.nextStep && exchangeCountRef.current >= CAPTURE_AFTER_EXCHANGES) {
            beginCapture();
          }
        } else if (companion?.nextStep) {
          detoursSincePromptRef.current += 1;
          reofferCapture();
        }
        maybeOfferConversion();
      }
    }
  }

  /* ---- Companion capture: woven into the chat, driven by the composer ----- *
   * Capture is a deterministic state machine on the server (validation,
   * next-field). The client's job is to make it feel like conversation: ask one
   * field at a time as ordinary assistant lines, read the answer from the same
   * composer the visitor asks questions in, and acknowledge each one.          */

  /** A friendly transcript label for what the visitor just answered. */
  function answerLabel(step: CaptureStep, value: string): string {
    if (step.input.type === 'choice') {
      return step.input.choices?.find((c) => c.value === value)?.label ?? value;
    }
    return value;
  }

  /**
   * Put a field's question on screen (goal chips render near the composer).
   * `lead` is whatever the companion was already saying — the greeting, an
   * acknowledgment — merged into the SAME bubble, because "Nice to meet you,
   * Shaun." and "What's the best email…" are one breath, not two messages.
   * Stacked one-line bubbles are what made this read like a form.
   */
  function promptForStep(step: CaptureStep, lead?: string) {
    detoursSincePromptRef.current = 0;
    // The goal step listens before it asks: if the conversation already said
    // why they're here ("what peptides help with weight loss?"), confirm the
    // inference instead of asking cold. Deterministic keyword matching, the
    // same matchCareArea the composer uses; nothing goes near the model.
    let prompt = step.prompt;
    if (step.field === 'goal') {
      let slug: string | null = null;
      for (const m of messages) {
        if (m.kind === 'text' && m.role === 'user') slug = matchCareArea(m.content) ?? slug;
      }
      const label = slug
        ? step.input.choices?.find((choice) => choice.value === slug)?.label
        : null;
      if (label) {
        prompt = `From what you've been asking, it sounds like ${label.toLowerCase()} is what brings you here. Tap it below to confirm, or pick what fits better.`;
      }
    }
    const content = lead ? `${lead} ${prompt}` : prompt;
    setMessages((prev) => [...prev, { kind: 'capture', role: 'assistant', content }]);
    scrollToEnd();
  }

  /** After the first real answer, the companion starts asking — woven, not gated. */
  function beginCapture() {
    const step = companion?.nextStep;
    if (!step || captureStartedRef.current) return;
    captureStartedRef.current = true;
    track({ event: 'capture_started' });
    promptForStep(step, companion?.copy.greeting);
  }

  /**
   * After a knowledge answer while a field is still pending, re-anchor it —
   * but not straight away. The composer placeholder already guides, so the
   * first detour passes quietly; after REOFFER_AFTER_DETOURS answers the
   * pending question is asked again (which resets the detour counter).
   */
  function reofferCapture() {
    const step = companion?.nextStep;
    if (!step || !captureStartedRef.current) return;
    if (detoursSincePromptRef.current < REOFFER_AFTER_DETOURS) return;
    // Once per field: a visitor who ignored the re-ask has answered — no more
    // nagging; the composer placeholder keeps quietly guiding.
    if (reofferedFieldsRef.current.has(step.field)) return;
    reofferedFieldsRef.current.add(step.field);
    promptForStep(step);
  }

  /** A warm line acknowledging what the visitor just gave. */
  function ackFor(step: CaptureStep, value: string, result: CompanionActionResult): string {
    if (step.field === 'name') return `Nice to meet you, ${result.profile.name ?? value}.`;
    if (step.field === 'email') return "Thanks, that's saved.";
    const label = result.profile.goalLabel ?? answerLabel(step, value);
    return `Great, ${label.toLowerCase()}. I'll keep that front of mind.`;
  }

  async function submitCapture(step: CaptureStep, value: string, note?: string) {
    setInput('');
    try {
      const result = await submitField.mutateAsync({ kind: 'field', field: step.field, value, note });
      track({ event: 'capture_field_submitted', field: step.field });
      setMessages((prev) => [
        ...prev,
        { kind: 'capture', role: 'user', content: answerLabel(step, value) },
      ]);
      const next = result.nextStep?.field ? result.nextStep : null;
      if (next) {
        // Ack and next question in one bubble — one conversational beat.
        promptForStep(next, ackFor(step, value, result));
      } else {
        completeCapture(ackFor(step, value, result), result.profile.goal);
      }
    } catch (error) {
      if (error instanceof FieldError) {
        // Keep it conversational: show what they typed, then a gentle re-ask.
        setMessages((prev) => [
          ...prev,
          { kind: 'capture', role: 'user', content: value },
          { kind: 'capture', role: 'assistant', content: `${error.message} Mind trying again?` },
        ]);
      } else {
        console.warn('capture: submit failed', error);
      }
    }
  }

  async function skipCapture(step: CaptureStep) {
    setInput('');
    try {
      const result = await submitField.mutateAsync({ kind: 'skip', field: step.field });
      track({ event: 'capture_skipped', field: step.field });
      const next = result.nextStep?.field ? result.nextStep : null;
      if (next) {
        // "No problem." flows straight into the next question, one bubble.
        promptForStep(next, 'No problem.');
      } else {
        completeCapture('No problem.', result.profile.goal);
      }
    } catch (error) {
      console.warn('capture: skip failed', error);
    }
  }

  /**
   * Capture is done: keep the momentum. The ack pivots straight into the
   * visitor's goal in the same bubble, with tappable starter questions, so
   * the conversation hands the next move back instead of ending on a
   * statement. The conversion offer still gets its usual check.
   */
  function completeCapture(ack: string, goal: string | null) {
    const starters = GOAL_FOLLOW_UPS[goal ?? 'not-sure'] ?? GOAL_FOLLOW_UPS['not-sure']!;
    setMessages((prev) => [
      ...prev,
      {
        kind: 'capture',
        role: 'assistant',
        content: `${ack} Want to see what the research actually says? Tap a question below, or ask your own.`,
      },
    ]);
    setSuggestions(starters);
    exchangesAtCaptureDoneRef.current = exchangeCountRef.current;
    maybeOfferConversion();
    scrollToEnd();
  }

  /**
   * Route a composer submission: is it an answer to the pending field, or a
   * question? Disambiguated per field so the visitor can just type naturally.
   */
  function routeCaptureOrAsk(text: string, opts: { viaVoice?: boolean } = {}) {
    if (!text || pending || submitField.isPending) return;
    const step = companion?.nextStep;
    if (!step || !captureStartedRef.current) {
      void send(text, opts);
      return;
    }
    if (isSkip(text)) {
      void skipCapture(step);
      return;
    }
    // Intent outranks capture. "I want to sign up" typed at the name step must
    // never become the visitor's name (and at the email step it isn't worth a
    // Bedrock call) — it's the conversion moment, so offer the journey and
    // leave the field pending. Questions fall through ("how much does it
    // cost?" deserves its answer first), and so does anything with an @ —
    // signup@example.com is an email answer, not intent.
    if (isBuyingSignal(text) && !looksLikeQuestion(text) && !text.includes('@')) {
      buyingSignalRef.current = true;
      setInput('');
      setMessages((prev) => [...prev, { kind: 'capture', role: 'user', content: text }]);
      if (!maybeOfferConversion()) {
        // The offer was suppressed (already on screen, or they've already
        // started) — the highest-intent message a visitor can send must never
        // hang with no reply. Consume the signal: it's been responded to.
        buyingSignalRef.current = false;
        const alreadyStarted =
          companion?.profile.status === 'ready' || companion?.profile.status === 'converted';
        setMessages((prev) => [
          ...prev,
          {
            kind: 'capture',
            role: 'assistant',
            content: alreadyStarted
              ? 'You’re already set up. Head to Get started whenever you like.'
              : 'Whenever you’re ready, “Start my journey” above will take you straight there. Happy to keep answering questions in the meantime.',
          },
        ]);
      }
      scrollToEnd();
      return;
    }
    if (step.field === 'name') {
      if (looksLikeQuestion(text)) void send(text, opts);
      else void submitCapture(step, text);
      return;
    }
    if (step.field === 'email') {
      // An email has an @; anything without one is a question we answer, leaving
      // email pending. A malformed address (has @) is caught server-side.
      if (text.includes('@')) void submitCapture(step, text);
      else void send(text, opts);
      return;
    }
    // goal
    const slug = matchCareArea(text);
    if (slug) {
      void submitCapture(step, slug);
      return;
    }
    if (looksLikeQuestion(text)) {
      void send(text, opts);
      return;
    }
    // Not a care area and not a question — nudge toward the chips.
    setInput('');
    setMessages((prev) => [
      ...prev,
      { kind: 'capture', role: 'user', content: text },
      {
        kind: 'capture',
        role: 'assistant',
        content: 'Tap one of the options below, or tell me a bit more about what you want to change.',
      },
    ]);
    scrollToEnd();
  }

  /**
   * The conversion offer, shown at the earliest of the three triggers. Not
   * strictly once any more: a *fresh* buying signal re-offers, but never
   * within CTA_REOFFER_EXCHANGES of the last offer — an offer that scrolled
   * past unnoticed shouldn't be the only one the visitor ever gets.
   */
  function maybeOfferConversion(): boolean {
    const status = companion?.profile.status;
    if (status === 'ready' || status === 'converted') return false;

    const captureDone = !companion?.nextStep;
    const oneMoreAfterCapture =
      exchangesAtCaptureDoneRef.current !== null &&
      exchangeCountRef.current > exchangesAtCaptureDoneRef.current;
    const trigger = buyingSignalRef.current
      ? ('buying_signal' as const)
      : captureDone && oneMoreAfterCapture
        ? ('capture_complete' as const)
        : exchangeCountRef.current >= CONVERSION_EXCHANGE_THRESHOLD
          ? ('exchange_threshold' as const)
          : null;
    if (!trigger) return false;

    const shownAt = ctaShownAtExchangeRef.current;
    if (shownAt !== null) {
      if (trigger !== 'buying_signal') return false;
      if (exchangeCountRef.current - shownAt < CTA_REOFFER_EXCHANGES) return false;
    }

    ctaShownAtExchangeRef.current = exchangeCountRef.current;
    buyingSignalRef.current = false; // consumed — a re-offer needs a fresh signal
    track({ event: 'conversion_cta_shown', trigger });
    const copy = companion?.copy;
    setMessages((prev) => [
      ...prev,
      {
        kind: 'cta',
        role: 'assistant',
        content: copy?.conversionPrompt ?? 'Whenever you’re ready, I can help you start your journey.',
        ctaLabel: copy?.conversionCtaLabel ?? 'Start my journey',
      },
    ]);
    scrollToEnd();
    return true;
  }

  async function startJourney() {
    try {
      const result = await submitField.mutateAsync({ kind: 'ready' });
      track({ event: 'conversion_cta_clicked' });
      router.push(result.handoff?.href ?? '/get-started');
    } catch (error) {
      console.warn('capture: start journey failed', error);
    }
  }

  // No form on load — the voice hero shows, and capture begins only after the
  // first real answer (see send's finally + beginCapture). This effect just
  // seeds the counters for a return visitor whose capture is already done, so
  // the conversion triggers behave and questions aren't re-asked.
  useEffect(() => {
    if (initRef.current || !companion) return;
    initRef.current = true;
    if (!companion.nextStep) {
      captureStartedRef.current = true;
      exchangesAtCaptureDoneRef.current = 0;
      // ready/converted visitors never see the offer again: maybeOfferConversion
      // checks the profile status directly, so nothing to seed here.
    } else if (
      companion.profile.name ||
      companion.profile.email ||
      companion.profile.goal
    ) {
      // Capture began in an earlier visit and a field is still pending. Resume
      // it VISIBLY: without this, a reload left only a placeholder hint, the
      // question was never on screen, and a typed answer ("Sean") was routed
      // to the model as a chat question instead of into the profile.
      captureStartedRef.current = true;
      promptForStep(companion.nextStep, 'Picking up where we left off.');
    }
  }, [companion]);

  // Pick up where they left off: when the server stores threads (history
  // mode), restore the latest one into the transcript with a local
  // welcome-back line. Ships dark — historyEnabled is false until
  // BRAIN_PERSIST_CONVERSATIONS is switched on server-side.
  const { data: resumed } = useLatestConversation(brainUi.historyEnabled);
  useEffect(() => {
    // Wait for the profile too, so the welcome-back line can carry the name.
    if (hydratedRef.current || !brainUi.historyEnabled || resumed === undefined || !companion)
      return;
    hydratedRef.current = true;
    if (!resumed || resumed.messages.length === 0) return;
    // Never clobber a conversation that already started this page load.
    if (messages.length > 0 || pending) return;

    const restored: DisplayMessage[] = [];
    for (const m of resumed.messages) {
      // A cut-off partial answer isn't worth replaying — drop it and the
      // question it half-answered, rather than showing text that stops
      // mid-sentence (and feeding it back to the model as if it were said).
      if (m.role === 'assistant' && m.aborted) {
        const prev = restored[restored.length - 1];
        if (prev?.kind === 'text' && prev.role === 'user') restored.pop();
        continue;
      }
      restored.push({
        kind: 'text',
        role: m.role,
        content: m.content,
        ...(m.role === 'assistant' && m.citations.length > 0 ? { citations: m.citations } : {}),
      });
    }
    if (restored.length === 0) return;
    // Restored exchanges count toward conversion pacing — a returning visitor
    // shouldn't need four fresh answers to see the offer again.
    exchangeCountRef.current = restored.filter(
      (m) => m.kind === 'text' && m.role === 'assistant',
    ).length;
    const name = companion?.profile.name;
    restored.push({
      kind: 'capture',
      role: 'assistant',
      content: `Welcome back${name ? `, ${name}` : ''}. We can pick up where we left off, or start something new.`,
    });
    resumedThreadRef.current = true;
    setMessages(restored);
    scrollToEnd();
    // One-shot by design (hydratedRef): deliberately not keyed on messages/pending.
  }, [resumed, brainUi.historyEnabled, companion]);

  /**
   * Start over: clear the transcript and open a new server thread so a reload
   * doesn't resurrect the one the visitor just discarded. Conversion pacing
   * resets with it — a fresh conversation earns a fresh offer.
   */
  function startFresh() {
    resumedThreadRef.current = false;
    setMessages([]);
    setSuggestions(null);
    exchangeCountRef.current = 0;
    detoursSincePromptRef.current = 0;
    ctaShownAtExchangeRef.current = null;
    buyingSignalRef.current = false;
    if (brainUi.historyEnabled) {
      void client.api.brain.conversations.$post().catch(() => {});
    }
  }

  const started = messages.length > 0;
  const busy = pending || transcribing;
  const micState = recorder.recording
    ? 'listening'
    : recorder.arming
      ? 'arming'
      : busy
        ? 'busy'
        : 'idle';

  const status = recorder.arming
    ? 'Connecting microphone…'
    : recorder.recording
      ? `Listening · pause when you're done · ${recorder.elapsed}s`
      : transcribing
        ? 'Writing that down…'
        : pending
          ? (toolStatus ?? 'Looking through the research…')
          : null;

  // What the composer is asking for right now drives its placeholder and the
  // goal chips. Null once capture is done (or before it begins).
  const pendingStep = captureStartedRef.current ? (companion?.nextStep ?? null) : null;
  const composerPlaceholder = recorder.recording && live.interim
    ? live.interim
    : pendingStep?.field === 'name'
      ? 'Type your first name…'
      : pendingStep?.field === 'email'
        ? 'Your email…'
        : pendingStep?.field === 'goal'
          ? 'Pick one below, or tell me in your own words…'
          : brainUi.inputPlaceholder;

  const composer = (
    <div className={cn(started && 'border-t border-line px-4 py-4 sm:px-6')}>
      {/* Goal step: tappable quick-replies sit right above the composer, so
          they're always reachable even after a question scrolls the thread. */}
      {pendingStep?.field === 'goal' ? (
        <div className="mb-3">
          <GoalChips
            step={pendingStep}
            // Also disabled while an answer streams: a capture turn appended
            // mid-stream is exactly the interleaving updateAssistant guards
            // against — better not to invite it from the UI at all.
            busy={submitField.isPending || pending}
            onSelect={(value) => void submitCapture(pendingStep, value)}
            onSkip={() => void skipCapture(pendingStep)}
          />
        </div>
      ) : null}

      {/* Post-capture starter questions: the next move, one tap away. */}
      {!pendingStep && suggestions ? (
        <div className="mb-3">
          <SuggestionChips
            suggestions={suggestions}
            busy={pending || transcribing}
            onAsk={(question) => void send(question)}
          />
        </div>
      ) : null}

      <form
        className="flex items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          routeCaptureOrAsk(input.trim());
        }}
      >
        {started ? (
          <VoiceMic
            state={micState}
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
              routeCaptureOrAsk(input.trim());
            }
          }}
          rows={started ? 1 : 2}
          maxLength={2000}
          disabled={transcribing || recorder.recording}
          placeholder={composerPlaceholder}
          aria-label={pendingStep ? `Answer: ${pendingStep.prompt}` : 'Type your question'}
          className={cn(
            'min-h-11 flex-1 resize-none text-ink outline-none transition-colors',
            'placeholder:text-muted disabled:opacity-50',
            started
              ? 'bg-transparent py-2.5'
              : 'rounded-[1.5rem] bg-surface px-5 py-3.5 focus-visible:ring-2 focus-visible:ring-brand-600/50',
          )}
        />
        <button
          type="submit"
          disabled={busy || recorder.recording || input.trim().length === 0}
          className={buttonClasses({ variant: 'solid', size: 'lg', className: 'shrink-0' })}
        >
          {pending ? 'Asking…' : pendingStep && pendingStep.field !== 'goal' ? 'Send' : 'Ask'}
        </button>
      </form>

      {/* A quiet way past name/email without a widget. */}
      {pendingStep && pendingStep.field !== 'goal' ? (
        <button
          type="button"
          onClick={() => void skipCapture(pendingStep)}
          disabled={submitField.isPending || pending}
          className="mono-label mt-2 text-muted transition-colors hover:text-ink disabled:opacity-50"
        >
          Skip
        </button>
      ) : null}

      {/* Restored-thread escape hatch: local clear; the server thread rotates
          on its own after a day idle. */}
      {resumedThreadRef.current ? (
        <button
          type="button"
          onClick={startFresh}
          disabled={pending}
          className="mono-label mt-2 ml-4 text-muted transition-colors hover:text-ink disabled:opacity-50"
        >
          Start a new conversation
        </button>
      ) : null}
    </div>
  );

  return (
    <div ref={rootRef} className="flex flex-col items-center">
      {/* ---- Hero: the microphone ---- */}
      <header
        className={cn(
          'flex flex-col items-center text-center transition-all duration-700',
          started ? 'pt-10 pb-6' : 'pt-14 pb-6 sm:pt-20',
        )}
      >
        <Eyebrow as="p">Ask Joice</Eyebrow>

        {!started ? (
          <>
            <h1 className="mt-6 max-w-3xl text-balance text-4xl leading-[1.1] text-ink sm:text-6xl">
              Ask it <span className="italic text-muted">out loud</span>.
            </h1>
            <p className="mt-6 max-w-md text-pretty text-lg leading-relaxed text-muted">
              {brainUi.emptyStateHint}
            </p>
          </>
        ) : (
          <h1 className="sr-only">Ask Joice</h1>
        )}

        {/* The microphone: the primary way in. */}
        {!started ? (
          <div className="relative mt-14 flex w-full justify-center">
            <VoiceMic
              state={micState}
              disabled={busy && !recorder.recording}
              onClick={() => toggleMic()}
            />
          </div>
        ) : null}

        {!started ? (
          <div className="mt-8 flex min-h-24 w-full max-w-2xl flex-col items-center gap-3 px-4">
            {recorder.recording ? (
              <VoiceVisualizer analyser={recorder.analyser} className="h-6 w-56 text-brand-600" />
            ) : null}
            {/* The words as they are spoken. */}
            {live.interim ? (
              <p className="max-w-xl text-balance text-lg leading-relaxed text-ink" aria-live="polite">
                {live.interim}
              </p>
            ) : (
              <p
                aria-live="polite"
                className={cn('mono-label', status ? 'text-brand-700' : 'text-muted')}
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
          started && 'border-y border-line',
        )}
      >
        {started ? (
          <div
            ref={scrollRef}
            className="flex max-h-[52vh] flex-col gap-6 overflow-y-auto scroll-pt-6 px-4 py-7 sm:px-6"
          >
            {messages.map((message, i) => {
              const messageId = `msg-${i}`;
              const align = message.role === 'user' ? 'self-end' : 'self-start';

              // The conversion offer and the clinician handoff: warm cards.
              // Same look, very different clicks — the conversion button marks
              // the lead ready; the handoff button only navigates.
              if (message.kind === 'cta' || message.kind === 'handoff') {
                const onClick =
                  message.kind === 'cta'
                    ? () => void startJourney()
                    : () => router.push('/get-started');
                return (
                  <div key={i} className={align}>
                    <div className="panel max-w-md rounded-card p-5">
                      <p className="text-pretty leading-relaxed text-ink">{message.content}</p>
                      <Button variant="solid" size="lg" className="mt-4" onClick={onClick}>
                        {message.ctaLabel} +
                      </Button>
                    </div>
                  </div>
                );
              }

              // A text or capture turn — rendered identically; capture turns
              // just never carry citations/errors and stay out of LLM history.
              const isSpeaking = speaker.speakingId === messageId;
              const text = message;
              const isError = text.kind === 'text' && Boolean(text.error);
              const citations = text.kind === 'text' ? text.citations : undefined;
              const toolsUsed = text.kind === 'text' ? text.toolsUsed : undefined;
              return (
                <div key={i} className={align}>
                  {text.role === 'user' ? (
                    <div className="max-w-md rounded-card rounded-br-lg bg-ink px-4 py-3 text-canvas">
                      {text.content}
                    </div>
                  ) : isError ? (
                    <div className="max-w-2xl rounded-card bg-surface px-4 py-3 text-red-800">
                      {text.content}
                    </div>
                  ) : (
                    <div className="max-w-2xl">
                      {text.content ? (
                        <AnswerMarkdown>{text.content}</AnswerMarkdown>
                      ) : (
                        <p className="mono-label text-muted">
                          {toolStatus ?? 'Looking through the research…'}
                        </p>
                      )}
                    </div>
                  )}

                  {text.role === 'assistant' && text.content && !isError ? (
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          isSpeaking ? speaker.stop() : void speaker.speak(text.content, messageId)
                        }
                        aria-label={isSpeaking ? 'Stop reading answer' : 'Read answer aloud'}
                        className="rounded-full border border-dotted border-transparent p-1.5 text-muted transition-colors hover:border-current hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-600 outline-none"
                      >
                        {isSpeaking ? <StopIcon className="h-4 w-4" /> : <SpeakerIcon className="h-4 w-4" />}
                      </button>
                      {isSpeaking ? (
                        <VoiceVisualizer
                          analyser={speaker.analyser}
                          className="h-5 w-28 text-brand-600"
                        />
                      ) : null}
                    </div>
                  ) : null}

                  {brainUi.showToolActivity && toolsUsed && toolsUsed.length > 0 ? (
                    // What the companion did for this answer. The server only
                    // sends the trace when the admin toggle is on; the brainUi
                    // check just mirrors the showCitations pattern (it can
                    // only ever hide, never reveal).
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {toolsUsed.map((tool) => (
                        <li
                          key={tool.name}
                          className="mono-label rounded-full border border-dotted border-line px-3 py-1 text-muted"
                        >
                          {tool.label.replace(/…$/, '')}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {brainUi.showCitations && citations && citations.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {citations.map((citation) => (
                        <li
                          key={citation.index}
                          title={citation.citedText}
                          className="mono-label rounded-full border border-line px-3 py-1 text-muted"
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

        {/* Composer: quiet second path below the mic when idle. */}
        {started ? (
          composer
        ) : (
          <div className="mx-auto max-w-xl px-4">
            <p className="mono-label mb-3 text-center text-muted">or type instead</p>
            {composer}
          </div>
        )}

        {started && status ? (
          <p
            aria-live="polite"
            className="mono-label px-6 pb-4 text-brand-700"
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
      <ul className="mt-16 mb-8 grid w-full max-w-3xl border-t border-line sm:grid-cols-3">
        {[
          ['Grounded', 'Answers come from our clinical team’s research library.'],
          ['Sourced', 'Every claim shows the study it came from.'],
          ['Honest', 'If the research doesn’t cover it, it says so.'],
        ].map(([label, detail]) => (
          <li
            key={label}
            className="border-b border-line py-5 sm:border-b-0 sm:border-r sm:px-5 sm:first:pl-0 sm:last:border-r-0"
          >
            <span className="mono-label text-ink">{label}</span>
            <p className="mt-2 text-sm leading-relaxed text-muted">{detail}</p>
          </li>
        ))}
      </ul>

      <p className="mono-label pb-16 text-center text-muted">{brainUi.disclaimer}</p>
    </div>
  );
}
