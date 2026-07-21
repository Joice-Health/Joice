'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Microphone capture for voice questions: raw PCM via the Web Audio API
 * (AudioWorklet, ScriptProcessor fallback) — deliberately NOT MediaRecorder,
 * whose codec varies by browser (Safari records AAC, which Transcribe rejects).
 * Audio stays in memory and is downsampled to 16kHz mono PCM16 for upload.
 *
 * Auto-stop: once speech has been heard, ~1.5s of silence ends the recording;
 * manual stop and a 60s hard cap are always in force.
 *
 * Startup latency: the mic stream is deliberately released after every
 * recording (the browser's "mic in use" indicator must not stay lit between
 * questions on a health product), so each start pays the device-acquisition
 * cost — the dominant part on Bluetooth headsets switching to their mic
 * profile. To keep that as short as possible the AudioContext and compiled
 * worklet are reused across recordings, the worklet load runs concurrently
 * with getUserMedia, and the `arming` state gives instant UI feedback.
 */

const TARGET_SAMPLE_RATE = 16_000;
const MAX_SECONDS = 60;
const SPEECH_RMS = 0.02; // above this, we consider the user to be talking
const SILENCE_RMS = 0.012; // below this (after speech), the silence timer runs
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
  /** Mic tapped, device still being acquired — show "connecting" feedback. */
  const [arming, setArming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // Reused across recordings (cheap to keep; the mic stream is NOT kept).
  const contextRef = useRef<AudioContext | null>(null);
  const workletReadyRef = useRef<Promise<boolean> | null>(null);

  const sessionRef = useRef<{
    context: AudioContext;
    stream: MediaStream;
    chunks: Float32Array[];
    stopped: boolean;
    heardSpeech: boolean;
    silenceSince: number | null;
    cleanup: () => void;
  } | null>(null);
  const callbacksRef = useRef({ onAudio, onError });
  callbacksRef.current = { onAudio, onError };

  const stop = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.stopped) return;
    session.stopped = true;
    sessionRef.current = null;

    const { context, chunks, cleanup, heardSpeech } = session;
    const inputRate = context.sampleRate;
    cleanup();
    setRecording(false);
    setAnalyser(null);
    setElapsed(0);

    if (!heardSpeech || chunks.length === 0) {
      callbacksRef.current.onError("Didn't catch that — try again a little louder.");
      return;
    }
    callbacksRef.current.onAudio(downsampleToPcm16(chunks, inputRate));
  }, []);

  const start = useCallback(async () => {
    if (sessionRef.current || arming) return;
    setArming(true); // synchronous — the button reacts before any async work

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

    let stream: MediaStream;
    let workletAvailable: boolean;
    try {
      [stream, workletAvailable] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        }),
        workletReadyRef.current,
        context.resume(), // user-gesture unlock (Safari)
      ]).then(([s, w]) => [s, w] as const);
    } catch {
      setArming(false);
      callbacksRef.current.onError(
        'Microphone access was blocked — allow it in your browser settings to ask by voice.',
      );
      return;
    }

    const source = context.createMediaStreamSource(stream);
    const analyserNode = context.createAnalyser();
    analyserNode.fftSize = 256;
    source.connect(analyserNode);

    const session = {
      context,
      stream,
      chunks: [] as Float32Array[],
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
      stream.getTracks().forEach((track) => track.stop()); // mic indicator goes off here
      void context.suspend(); // keep the context (and compiled worklet) for next time
    };

    setAnalyser(analyserNode);
    setArming(false);
    setRecording(true);
    setElapsed(0);
  }, [arming, stop]);

  // Unmount safety: release the mic and the reusable context.
  useEffect(
    () => () => {
      sessionRef.current?.cleanup();
      void contextRef.current?.close();
    },
    [],
  );

  return { arming, recording, elapsed, analyser, start, stop };
}
