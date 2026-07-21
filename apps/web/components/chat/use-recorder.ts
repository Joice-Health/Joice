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

/**
 * Stateful 16kHz downsampler for the live stream. It carries the fractional
 * read position across calls, so consecutive chunks join seamlessly — resampling
 * each chunk independently would put a small discontinuity at every boundary,
 * several times a second, right in the middle of speech.
 */
function createDownsampler(inputRate: number) {
  const ratio = inputRate / TARGET_SAMPLE_RATE;
  let carry = new Float32Array(0);
  let position = 0;

  return function push(frame: Float32Array): Uint8Array | null {
    const merged = new Float32Array(carry.length + frame.length);
    merged.set(carry);
    merged.set(frame, carry.length);
    carry = merged;

    const available = Math.floor((carry.length - 1 - position) / ratio);
    if (available <= 0) return null;

    const out = new Uint8Array(available * 2);
    const view = new DataView(out.buffer);
    for (let i = 0; i < available; i++) {
      const pos = position + i * ratio;
      const left = Math.floor(pos);
      const t = pos - left;
      const sample = (carry[left] ?? 0) * (1 - t) + (carry[left + 1] ?? 0) * t;
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    }

    const consumed = position + available * ratio;
    const keepFrom = Math.floor(consumed);
    carry = carry.slice(keepFrom);
    position = consumed - keepFrom;
    return out;
  };
}

/** Join the recording's 16kHz PCM16 pieces into the single clip the API takes. */
function concatPcm(parts: readonly Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** ~200ms of 16kHz PCM16 per streamed chunk — steady partials without chatter. */
const STREAM_CHUNK_BYTES = 6_400;

export interface UseRecorderOptions {
  /** Called with 16kHz mono PCM16 when recording ends (auto or manual). */
  onAudio: (pcm: Uint8Array) => void;
  /** Called continuously while recording, for live transcription. */
  onChunk?: (pcm: Uint8Array) => void;
  onError: (message: string) => void;
}

export function useRecorder({ onAudio, onChunk, onError }: UseRecorderOptions) {
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
    /** The clip so far as 16kHz PCM16 — see the note where a session is built. */
    pcm: Uint8Array[];
    pcmBytes: number;
    stopped: boolean;
    heardSpeech: boolean;
    silenceSince: number | null;
    cleanup: () => void;
  } | null>(null);
  const callbacksRef = useRef({ onAudio, onChunk, onError });
  callbacksRef.current = { onAudio, onChunk, onError };

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

    const { cleanup, heardSpeech, pcm, pcmBytes } = session;
    cleanup();
    setRecording(false);
    setAnalyser(null);
    setElapsed(0);

    // Keep the mic warm for fast follow-ups; release after a quiet minute.
    if (warmTimerRef.current) clearTimeout(warmTimerRef.current);
    warmTimerRef.current = setTimeout(releaseMic, WARM_MS);

    if (!heardSpeech || pcmBytes === 0) {
      callbacksRef.current.onError("Didn't catch that — try again a little louder.");
      return;
    }
    callbacksRef.current.onAudio(concatPcm(pcm, pcmBytes));
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
        /**
         * The recording so far, already downsampled to the 16kHz PCM16 the API
         * takes. Retaining the raw 48kHz Float32 frames instead cost ~192KB per
         * second — about 11MB for a full-length recording, held until the next
         * one replaced it, which degraded the tab and crashed it on mobile.
         * Same bytes the live stream sends, so this costs nothing extra and
         * still backs the batch fallback when the socket doesn't work.
         */
        pcm: [] as Uint8Array[],
        pcmBytes: 0,
        stopped: false,
        heardSpeech: false,
        silenceSince: null as number | null,
        cleanup: () => {},
      };
      sessionRef.current = session;

      // Downsample continuously: feeds both the live stream and the fallback.
      const downsample = createDownsampler(context.sampleRate);
      let streamBuffer: Uint8Array[] = [];
      let streamBytes = 0;
      const flushStream = (force = false) => {
        if (streamBytes === 0 || (!force && streamBytes < STREAM_CHUNK_BYTES)) return;
        const merged = new Uint8Array(streamBytes);
        let offset = 0;
        for (const part of streamBuffer) {
          merged.set(part, offset);
          offset += part.length;
        }
        streamBuffer = [];
        streamBytes = 0;
        callbacksRef.current.onChunk?.(merged);
      };

      const handleFrame = (frame: Float32Array) => {
        if (session.stopped) return;

        // The frame itself is never retained — only its downsampled form.
        const pcm = downsample(frame);
        if (pcm) {
          session.pcm.push(pcm);
          session.pcmBytes += pcm.length;
          if (callbacksRef.current.onChunk) {
            streamBuffer.push(pcm);
            streamBytes += pcm.length;
            flushStream();
          }
        }

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
      let releaseCapture = () => {};
      if (workletAvailable) {
        const worklet = new AudioWorkletNode(context, 'joice-capture', {
          numberOfInputs: 1,
          numberOfOutputs: 0,
        });
        worklet.port.onmessage = (e: MessageEvent<Float32Array>) => handleFrame(e.data);
        source.connect(worklet);
        capture = worklet;
        // A new node is created per recording, and disconnecting one does not
        // close its message port — without this the old ports stay open, each
        // holding its processor and the frames it posted.
        releaseCapture = () => {
          worklet.port.onmessage = null;
          worklet.port.close();
        };
      } else {
        const processor = context.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => handleFrame(e.inputBuffer.getChannelData(0).slice(0));
        source.connect(processor);
        processor.connect(context.destination); // required for ScriptProcessor to fire
        capture = processor;
        releaseCapture = () => {
          processor.onaudioprocess = null;
        };
      }

      const startedAt = performance.now();
      const ticker = setInterval(() => {
        const seconds = Math.floor((performance.now() - startedAt) / 1000);
        setElapsed(seconds);
        if (seconds >= MAX_SECONDS) stop();
      }, 250);

      session.cleanup = () => {
        clearInterval(ticker);
        flushStream(true); // don't strand the final fraction of a second
        capture.disconnect();
        releaseCapture();
        source.disconnect();
        streamBuffer = [];
        streamBytes = 0;
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
