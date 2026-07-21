'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Microphone capture for voice questions: raw PCM via the Web Audio API
 * (AudioWorklet, ScriptProcessor fallback) — deliberately NOT MediaRecorder,
 * whose codec varies by browser (Safari records AAC, which Transcribe rejects).
 * Audio stays in memory and is downsampled to 16kHz mono PCM16 for upload.
 *
 * Latency design — why the mic stays warm:
 * Opening the mic is the slow part (device acquisition; Bluetooth headsets
 * switching profiles; Chrome's auto-gain ramping from silence — together a
 * 1–3s dead zone where early words are lost). So after a recording ends the
 * MediaStream is kept alive for WARM_MS and repeat taps start instantly with
 * gain already adapted. The stream is released — browser mic indicator goes
 * dark — after a minute of no voice use, when the tab is hidden, or on
 * unmount. Audio is only CAPTURED while `recording` is true; the warm stream
 * is never read between recordings.
 *
 * Auto-stop: once speech has been heard, ~1.5s of silence ends the recording;
 * manual stop and a 60s hard cap are always in force.
 */

const TARGET_SAMPLE_RATE = 16_000;
const MAX_SECONDS = 60;
const WARM_MS = 60_000; // how long the mic stays warm after a recording
// AGC ramps input gain up from near-zero over the first seconds — thresholds
// must be low enough to catch early, quiet speech.
const SPEECH_RMS = 0.012; // above this, we consider the user to be talking
const SILENCE_RMS = 0.008; // below this (after speech), the silence timer runs
const SILENCE_MS = 1500;

/** Runs in the AudioWorklet thread: forward raw input frames to the main thread. */
const WORKLET_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('joice-capture', CaptureProcessor);
`;

function downsampleToPcm16(chunks: Float32Array[], inputRate: number): Uint8Array {
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  const samples = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }

  const ratio = inputRate / TARGET_SAMPLE_RATE;
  const outLength = Math.floor(samples.length / ratio);
  const out = new Uint8Array(outLength * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const t = pos - left;
    const sample =
      (samples[left] ?? 0) * (1 - t) + (samples[Math.min(left + 1, samples.length - 1)] ?? 0) * t;
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return out;
}

export interface UseRecorderOptions {
  /** Called with 16kHz mono PCM16 when recording ends (auto or manual). */
  onAudio: (pcm: Uint8Array) => void;
  onError: (message: string) => void;
}

export function useRecorder({ onAudio, onError }: UseRecorderOptions) {
  /** Mic tapped, device still being acquired — shows "connecting" feedback. */
  const [arming, setArming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // Long-lived across recordings: context + compiled worklet + warm stream.
  const contextRef = useRef<AudioContext | null>(null);
  const workletReadyRef = useRef<Promise<boolean> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const warmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armingRef = useRef(false);
  const sessionRef = useRef<{
    chunks: Float32Array[];
    inputRate: number;
    stopped: boolean;
    heardSpeech: boolean;
    silenceSince: number | null;
    cleanup: () => void;
  } | null>(null);
  const callbacksRef = useRef({ onAudio, onError });
  callbacksRef.current = { onAudio, onError };

  /** Fully release the mic (browser indicator goes dark). */
  const releaseMic = useCallback(() => {
    if (warmTimerRef.current) clearTimeout(warmTimerRef.current);
    warmTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.suspend();
  }, []);

  const stop = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.stopped) return;
    session.stopped = true;
    sessionRef.current = null;

    const { chunks, cleanup, heardSpeech, inputRate } = session;
    cleanup();
    setRecording(false);
    setAnalyser(null);
    setElapsed(0);

    // Keep the mic warm for fast follow-ups; release after a quiet minute.
    if (warmTimerRef.current) clearTimeout(warmTimerRef.current);
    warmTimerRef.current = setTimeout(releaseMic, WARM_MS);

    if (!heardSpeech || chunks.length === 0) {
      callbacksRef.current.onError("Didn't catch that — try again a little louder.");
      return;
    }
    callbacksRef.current.onAudio(downsampleToPcm16(chunks, inputRate));
  }, [releaseMic]);

  const start = useCallback(async () => {
    if (sessionRef.current || armingRef.current) return;
    armingRef.current = true;
    if (warmTimerRef.current) clearTimeout(warmTimerRef.current);

    try {
      const context = (contextRef.current ??= new AudioContext());
      // Compile the worklet once per context, concurrently with mic acquisition.
      workletReadyRef.current ??= (async () => {
        try {
          const moduleUrl = URL.createObjectURL(
            new Blob([WORKLET_SOURCE], { type: 'application/javascript' }),
          );
          await context.audioWorklet.addModule(moduleUrl);
          URL.revokeObjectURL(moduleUrl);
          return true;
        } catch {
          return false; // ScriptProcessor fallback below
        }
      })();

      // Warm path: the stream from a recent recording is still live → instant.
      let stream = streamRef.current;
      const warm = Boolean(stream?.getTracks().some((t) => t.readyState === 'live'));
      let workletAvailable: boolean;

      if (warm && stream) {
        [workletAvailable] = await Promise.all([workletReadyRef.current, context.resume()]).then(
          ([w]) => [w] as const,
        );
      } else {
        setArming(true); // synchronous — the UI reacts before slow device work
        let fresh: MediaStream;
        try {
          const results = await Promise.all([
            navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            }),
            workletReadyRef.current,
            context.resume(), // user-gesture unlock (Safari)
          ]);
          fresh = results[0];
          workletAvailable = results[1];
        } catch {
          setArming(false);
          armingRef.current = false;
          callbacksRef.current.onError(
            'Microphone access was blocked — allow it in your browser settings to ask by voice.',
          );
          return;
        }
        stream = fresh;
        streamRef.current = fresh;
        // Headset disconnected / OS revoked → next start re-acquires cleanly.
        fresh.getTracks().forEach((track) => {
          track.onended = () => {
            if (streamRef.current === fresh) releaseMic();
          };
        });
      }

      if (!stream) throw new Error('no stream'); // unreachable; narrows the type
      const source = context.createMediaStreamSource(stream);
      const analyserNode = context.createAnalyser();
      analyserNode.fftSize = 256;
      source.connect(analyserNode);

      const session = {
        chunks: [] as Float32Array[],
        inputRate: context.sampleRate,
        stopped: false,
        heardSpeech: false,
        silenceSince: null as number | null,
        cleanup: () => {},
      };
      sessionRef.current = session;

      const handleFrame = (frame: Float32Array) => {
        if (session.stopped) return;
        session.chunks.push(frame);

        let sum = 0;
        for (let i = 0; i < frame.length; i++) sum += frame[i]! * frame[i]!;
        const rms = Math.sqrt(sum / frame.length);

        if (rms >= SPEECH_RMS) {
          session.heardSpeech = true;
          session.silenceSince = null;
        } else if (session.heardSpeech && rms < SILENCE_RMS) {
          session.silenceSince ??= performance.now();
          if (performance.now() - session.silenceSince >= SILENCE_MS) stop();
        } else {
          session.silenceSince = null;
        }
      };

      let capture: { disconnect(): void };
      if (workletAvailable) {
        const worklet = new AudioWorkletNode(context, 'joice-capture', {
          numberOfInputs: 1,
          numberOfOutputs: 0,
        });
        worklet.port.onmessage = (e: MessageEvent<Float32Array>) => handleFrame(e.data);
        source.connect(worklet);
        capture = worklet;
      } else {
        const processor = context.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => handleFrame(e.inputBuffer.getChannelData(0).slice(0));
        source.connect(processor);
        processor.connect(context.destination); // required for ScriptProcessor to fire
        capture = processor;
      }

      const startedAt = performance.now();
      const ticker = setInterval(() => {
        const seconds = Math.floor((performance.now() - startedAt) / 1000);
        setElapsed(seconds);
        if (seconds >= MAX_SECONDS) stop();
      }, 250);

      session.cleanup = () => {
        clearInterval(ticker);
        capture.disconnect();
        source.disconnect();
        // Stream stays warm — released by the WARM_MS timer, not here.
      };

      setAnalyser(analyserNode);
      setArming(false);
      setRecording(true);
      setElapsed(0);
    } catch {
      // Whatever failed, never leave the button stuck in "arming".
      setArming(false);
      sessionRef.current = null;
      callbacksRef.current.onError('Could not start recording — try again.');
    } finally {
      armingRef.current = false;
    }
  }, [releaseMic, stop]);

  // Tab hidden → stop any active recording and release the mic immediately.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        stop();
        releaseMic();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [stop, releaseMic]);

  // Unmount safety: release everything.
  useEffect(
    () => () => {
      sessionRef.current?.cleanup();
      sessionRef.current = null;
      releaseMic();
      void contextRef.current?.close();
      contextRef.current = null;
      workletReadyRef.current = null;
    },
    [releaseMic],
  );

  return { arming, recording, elapsed, analyser, start, stop };
}
