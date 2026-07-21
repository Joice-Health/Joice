'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { brainUrl } from '@/lib/env';
import { forSpeech, takeChunk } from './speech-text';

// Re-exported so existing importers keep working; the implementations moved to
// speech-text.ts, which has no React imports and so can be unit-tested.
export { forSpeech, takeChunk };

/**
 * Speaks answers *while they are still being written*.
 *
 * Waiting for the whole answer, then synthesizing it in one go, left ten-odd
 * seconds of silence on a long reply. Instead the text is cut into sentences as
 * it streams in; each sentence is synthesized the moment it's complete and the
 * clips are scheduled back-to-back on the audio clock, so playback is gapless
 * and starts after the first sentence rather than the last.
 *
 * Raw fetch is the sanctioned exception here (like SSE) — audio bytes don't
 * flow through the typed hooks.
 */

export function useSpeaker() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  /** Bumped on every stop/new utterance so late responses can be discarded. */
  const generationRef = useRef(0);
  const bufferRef = useRef('');
  const nextIndexRef = useRef(0); // next chunk index to request
  const playIndexRef = useRef(0); // next chunk index to schedule
  const readyRef = useRef(new Map<number, AudioBuffer>());
  const pendingRef = useRef(0); // synthesis requests in flight
  const endedRef = useRef(true); // no more text coming
  const nextStartRef = useRef(0); // audio-clock time for gapless scheduling

  const ensureContext = useCallback(async () => {
    const context = (contextRef.current ??= new AudioContext());
    if (!analyserRef.current) {
      const node = context.createAnalyser();
      node.fftSize = 256;
      node.connect(context.destination);
      analyserRef.current = node;
    }
    await context.resume(); // Safari autoplay unlock (called from a gesture)
    return context;
  }, []);

  const stop = useCallback(() => {
    generationRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    for (const source of sourcesRef.current) {
      try {
        source.stop();
      } catch {
        // already finished
      }
    }
    sourcesRef.current = [];
    readyRef.current.clear();
    bufferRef.current = '';
    nextIndexRef.current = 0;
    playIndexRef.current = 0;
    // pendingRef is deliberately NOT reset. The abort above makes every
    // in-flight request settle, and each one decrements in its `finally` —
    // zeroing here made those decrements drive the count negative, after which
    // `pendingRef.current > 0` read false with work still outstanding and the
    // speaking indicator cleared in the middle of a sentence.
    endedRef.current = true;
    nextStartRef.current = 0;
    setSpeakingId(null);
    setAnalyser(null);
  }, []);

  /** Everything synthesized, scheduled and played? Then the utterance is over. */
  const settleIfDone = useCallback(() => {
    if (!endedRef.current || pendingRef.current > 0 || readyRef.current.size > 0) return;
    if (bufferRef.current.trim()) return;
    const context = contextRef.current;
    if (!context) return;
    const remaining = (nextStartRef.current - context.currentTime) * 1000;
    window.setTimeout(
      () => {
        if (pendingRef.current === 0 && endedRef.current && readyRef.current.size === 0) {
          setSpeakingId(null);
          setAnalyser(null);
        }
      },
      Math.max(0, remaining) + 80,
    );
  }, []);

  /** Schedule any decoded clips that are next in line, back-to-back. */
  const drain = useCallback(() => {
    const context = contextRef.current;
    const output = analyserRef.current;
    if (!context || !output) return;

    while (readyRef.current.has(playIndexRef.current)) {
      const buffer = readyRef.current.get(playIndexRef.current)!;
      readyRef.current.delete(playIndexRef.current);
      playIndexRef.current++;

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(output);
      const startAt = Math.max(context.currentTime + 0.02, nextStartRef.current);
      source.start(startAt);
      nextStartRef.current = startAt + buffer.duration;
      sourcesRef.current.push(source);
      source.onended = () => {
        sourcesRef.current = sourcesRef.current.filter((s) => s !== source);
        settleIfDone();
      };
    }
    settleIfDone();
  }, [settleIfDone]);

  const synthesize = useCallback(
    async (text: string, index: number, generation: number) => {
      pendingRef.current++;
      try {
        const context = contextRef.current;
        if (!context) return;
        const res = await fetch(`${brainUrl}/api/brain/voice/speak`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: abortRef.current?.signal,
        });
        if (!res.ok) throw new Error(`speak failed (${res.status})`);
        const decoded = await context.decodeAudioData(await res.arrayBuffer());
        if (generation !== generationRef.current) return; // superseded
        readyRef.current.set(index, decoded);
        drain();
      } catch (error) {
        // Swallowing this is how an entire answer went unspoken with no trace:
        // an oversized chunk 400'd and the silence looked like a design choice.
        if ((error as Error)?.name !== 'AbortError') {
          console.warn('speak: chunk failed, skipping it', error);
        }
        // A dropped clip shouldn't strand the rest: let the queue move past it.
        if (generation === generationRef.current) {
          playIndexRef.current = Math.max(playIndexRef.current, index + 1);
          drain();
        }
      } finally {
        pendingRef.current--;
        settleIfDone();
      }
    },
    [drain, settleIfDone],
  );

  /** Cut whatever is buffered into chunks and start synthesizing them. */
  const pump = useCallback(
    (flush: boolean) => {
      const generation = generationRef.current;
      for (;;) {
        const taken = takeChunk(bufferRef.current, nextIndexRef.current === 0, flush);
        if (!taken) break;
        const [chunk, rest] = taken;
        bufferRef.current = rest;
        const spoken = forSpeech(chunk);
        if (spoken) void synthesize(spoken, nextIndexRef.current++, generation);
        if (!rest) break;
      }
      settleIfDone();
    },
    [synthesize, settleIfDone],
  );

  /** Begin a streamed utterance. Call from a user gesture where possible. */
  const startStream = useCallback(
    async (id: string) => {
      stop();
      await ensureContext();
      abortRef.current = new AbortController();
      endedRef.current = false;
      setSpeakingId(id);
      setAnalyser(analyserRef.current);
    },
    [ensureContext, stop],
  );

  /** Feed answer text as it streams in. */
  const pushText = useCallback(
    (text: string) => {
      if (endedRef.current) return;
      bufferRef.current += text;
      pump(false);
    },
    [pump],
  );

  /** No more text — speak whatever is left. */
  const endStream = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    pump(true);
  }, [pump]);

  /** One-shot playback (the play button on an existing answer). */
  const speak = useCallback(
    async (text: string, id: string) => {
      await startStream(id);
      pushText(text);
      endStream();
    },
    [startStream, pushText, endStream],
  );

  useEffect(
    () => () => {
      stop();
      void contextRef.current?.close();
    },
    [stop],
  );

  return { speak, startStream, pushText, endStream, stop, speakingId, analyser };
}
