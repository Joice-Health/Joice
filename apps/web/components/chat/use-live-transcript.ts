'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/env';

/**
 * Live transcription over a WebSocket: PCM goes up as it's captured and partial
 * transcripts come back while the member is still speaking, so the words appear
 * in real time instead of after a pause.
 *
 * Everything degrades: if the socket never opens (blocked proxy, older browser)
 * `finish()` resolves to null and the caller falls back to the batch
 * POST /api/voice/transcribe with the full recording.
 */

const SOCKET_URL = `${apiUrl.replace(/^http/, 'ws')}/api/voice/stream`;
/** How long to wait after the last audio for Transcribe to flush its final result. */
const DRAIN_TIMEOUT_MS = 4_000;

export function useLiveTranscript() {
  const [interim, setInterim] = useState('');
  const socketRef = useRef<WebSocket | null>(null);
  const finalsRef = useRef<string[]>([]);
  const partialRef = useRef('');
  const pendingRef = useRef<Uint8Array[]>([]);
  const doneRef = useRef<((text: string | null) => void) | null>(null);

  const teardown = useCallback(() => {
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
    pendingRef.current = [];
  }, []);

  /** Open a session for one recording. Never throws — failure just disables live mode. */
  const open = useCallback(() => {
    teardown();
    finalsRef.current = [];
    partialRef.current = '';
    setInterim('');

    try {
      const socket = new WebSocket(SOCKET_URL);
      socket.binaryType = 'arraybuffer';
      socketRef.current = socket;

      socket.onopen = () => {
        // Flush anything captured while the socket was still connecting.
        for (const chunk of pendingRef.current) socket.send(chunk);
        pendingRef.current = [];
      };

      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        const message = JSON.parse(event.data) as { type: string; text?: string };

        if (message.type === 'partial' && message.text) {
          partialRef.current = message.text;
        } else if (message.type === 'final' && message.text) {
          finalsRef.current.push(message.text);
          partialRef.current = '';
        } else if (message.type === 'done' || message.type === 'error') {
          doneRef.current?.(finalsRef.current.join(' ').trim() || null);
          doneRef.current = null;
          return;
        }
        setInterim([...finalsRef.current, partialRef.current].join(' ').trim());
      };

      socket.onerror = () => {
        doneRef.current?.(null);
        doneRef.current = null;
      };

      socket.onclose = () => {
        // Resolve with whatever arrived if the server closed before "done".
        doneRef.current?.(finalsRef.current.join(' ').trim() || null);
        doneRef.current = null;
      };
    } catch {
      socketRef.current = null;
    }
  }, [teardown]);

  const push = useCallback((pcm: Uint8Array) => {
    const socket = socketRef.current;
    if (!socket) return;
    if (socket.readyState === WebSocket.CONNECTING) {
      pendingRef.current.push(pcm);
      return;
    }
    if (socket.readyState === WebSocket.OPEN) socket.send(pcm);
  }, []);

  /**
   * Close the audio side and wait for the last finals. Resolves with the full
   * transcript, or null when live transcription didn't work (use the fallback).
   */
  const finish = useCallback(async (): Promise<string | null> => {
    const socket = socketRef.current;
    if (!socket || socket.readyState > WebSocket.OPEN) {
      teardown();
      return null;
    }

    const text = await new Promise<string | null>((resolve) => {
      doneRef.current = resolve;
      const drain = setTimeout(() => {
        doneRef.current = null;
        resolve(finalsRef.current.join(' ').trim() || null);
      }, DRAIN_TIMEOUT_MS);
      const settle = (value: string | null) => {
        clearTimeout(drain);
        resolve(value);
      };
      doneRef.current = settle;

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'end' }));
      } else {
        settle(null);
      }
    });

    teardown();
    setInterim('');
    return text;
  }, [teardown]);

  useEffect(() => teardown, [teardown]);

  return { interim, open, push, finish };
}
