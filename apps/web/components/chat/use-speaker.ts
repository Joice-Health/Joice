'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/env';

/**
 * Plays spoken answers: POSTs text to /api/voice/speak (Polly mp3), decodes it
 * with the Web Audio API, and routes playback through an AnalyserNode so the
 * visualizer animates from the real audio signal. Raw fetch is the sanctioned
 * exception here (like SSE) — audio bytes don't flow through typed hooks.
 */
export function useSpeaker() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const stop = useCallback(() => {
    try {
      sourceRef.current?.stop();
    } catch {
      // already stopped
    }
    sourceRef.current = null;
    setSpeakingId(null);
    setAnalyser(null);
  }, []);

  const speak = useCallback(
    async (text: string, id: string) => {
      stop();
      // Create/resume inside the click gesture — Safari autoplay unlock.
      const context = (contextRef.current ??= new AudioContext());
      await context.resume();
      setSpeakingId(id); // optimistic: shows the pending state on the message

      try {
        const res = await fetch(`${apiUrl}/api/voice/speak`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(`speak failed (${res.status})`);

        const buffer = await context.decodeAudioData(await res.arrayBuffer());
        const analyserNode = context.createAnalyser();
        analyserNode.fftSize = 256;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(analyserNode);
        analyserNode.connect(context.destination);
        source.onended = () => {
          if (sourceRef.current === source) {
            sourceRef.current = null;
            setSpeakingId(null);
            setAnalyser(null);
          }
        };
        sourceRef.current = source;
        setAnalyser(analyserNode);
        source.start();
      } catch {
        // The answer is already on screen — voice failure degrades silently.
        setSpeakingId(null);
        setAnalyser(null);
      }
    },
    [stop],
  );

  useEffect(
    () => () => {
      stop();
      void contextRef.current?.close();
    },
    [stop],
  );

  return { speak, stop, speakingId, analyser };
}
