import {
  StartStreamTranscriptionCommand,
  TranscribeStreamingClient,
} from '@aws-sdk/client-transcribe-streaming';
import { PollyClient, SynthesizeSpeechCommand, type VoiceId } from '@aws-sdk/client-polly';

/**
 * Voice clients for the chatbot: Amazon Transcribe (speech → text) and Amazon
 * Polly (text → speech). Both are HIPAA-eligible AWS services under the AWS
 * BAA and IAM-authenticated via the ECS task role — member voice audio never
 * leaves AWS and is processed in memory only (never persisted, never logged).
 *
 * Same stub-friendly interface pattern as bedrock.ts: tests stub these, and
 * a provider change only touches this file.
 */

/** The browser downsamples to this before upload; Transcribe is told the same. */
export const VOICE_SAMPLE_RATE = 16_000;

export interface TranscribeClient {
  /** 16kHz mono PCM16 little-endian → transcript ('' when nothing recognized). */
  transcribe(pcm: Uint8Array): Promise<string>;
}

export function createTranscribeClient(opts: { region: string }): TranscribeClient {
  const client = new TranscribeStreamingClient({ region: opts.region });

  return {
    async transcribe(pcm) {
      // Transcribe streaming wants a chunked audio stream, not one giant blob.
      const CHUNK_BYTES = 8 * 1024;
      async function* audioStream() {
        for (let offset = 0; offset < pcm.length; offset += CHUNK_BYTES) {
          yield { AudioEvent: { AudioChunk: pcm.slice(offset, offset + CHUNK_BYTES) } };
        }
      }

      const response = await client.send(
        new StartStreamTranscriptionCommand({
          LanguageCode: 'en-US',
          MediaEncoding: 'pcm',
          MediaSampleRateHertz: VOICE_SAMPLE_RATE,
          AudioStream: audioStream(),
        }),
      );

      const parts: string[] = [];
      for await (const event of response.TranscriptResultStream ?? []) {
        for (const result of event.TranscriptEvent?.Transcript?.Results ?? []) {
          if (result.IsPartial) continue;
          const text = result.Alternatives?.[0]?.Transcript;
          if (text) parts.push(text);
        }
      }
      return parts.join(' ').trim();
    },
  };
}

export interface TranscriptEvent {
  text: string;
  /** True while Transcribe is still revising this phrase. */
  isPartial: boolean;
}

export interface TranscribeSession {
  /** Push 16kHz mono PCM16 as it is captured. */
  write(pcm: Uint8Array): void;
  /**
   * Signal end of audio; the results iterator finishes once Transcribe drains,
   * and the underlying client is released at that point. Always call this —
   * including on an aborted connection — or the session's connection leaks.
   */
  end(): void;
  /** Partial results arrive while the member is still speaking. */
  results: AsyncIterable<TranscriptEvent>;
}

/**
 * A LIVE transcription session: audio goes in as it is spoken and partial
 * transcripts come back immediately, which is what makes the text appear while
 * someone is still talking. (The batch `transcribe()` above waits for the whole
 * clip — fine as a fallback, far too slow to feel real-time.)
 */
export function createTranscribeSession(opts: { region: string }): TranscribeSession {
  const client = new TranscribeStreamingClient({ region: opts.region });

  // Hand-rolled async queue: the SDK pulls from this iterator while the
  // WebSocket pushes into it, so neither side blocks the other.
  const pending: Uint8Array[] = [];
  let notify: (() => void) | null = null;
  let closed = false;

  const audioStream = {
    async *[Symbol.asyncIterator]() {
      while (true) {
        const chunk = pending.shift();
        if (chunk) {
          yield { AudioEvent: { AudioChunk: chunk } };
          continue;
        }
        if (closed) return;
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
      }
    },
  };

  async function* results(): AsyncGenerator<TranscriptEvent> {
    try {
      const response = await client.send(
        new StartStreamTranscriptionCommand({
          LanguageCode: 'en-US',
          MediaEncoding: 'pcm',
          MediaSampleRateHertz: VOICE_SAMPLE_RATE,
          AudioStream: audioStream,
        }),
      );

      for await (const event of response.TranscriptResultStream ?? []) {
        for (const result of event.TranscriptEvent?.Transcript?.Results ?? []) {
          const text = result.Alternatives?.[0]?.Transcript;
          if (text) yield { text, isPartial: Boolean(result.IsPartial) };
        }
      }
    } finally {
      // One client per session, each holding an HTTP/2 connection pool. Without
      // this every voice interaction leaks one for the life of the process.
      // `finally` covers all three exits: drained, threw, or abandoned by the
      // consumer (an abandoned generator is closed when it is garbage collected
      // or returned, and the socket handler drops its reference on close).
      client.destroy();
    }
  }

  return {
    write(pcm) {
      if (closed) return;
      pending.push(pcm);
      notify?.();
      notify = null;
    },
    end() {
      closed = true;
      notify?.();
      notify = null;
    },
    results: results(),
  };
}

export interface SpeechClient {
  /** Plain text → mp3 bytes. */
  synthesize(text: string): Promise<Uint8Array>;
}

export function createSpeechClient(opts: {
  region: string;
  /** Resolved per call so the admin can switch voices at runtime. */
  getVoiceId: () => Promise<string>;
}): SpeechClient {
  const client = new PollyClient({ region: opts.region });

  return {
    async synthesize(text) {
      const response = await client.send(
        new SynthesizeSpeechCommand({
          Engine: 'neural',
          VoiceId: (await opts.getVoiceId()) as VoiceId,
          OutputFormat: 'mp3',
          Text: text,
        }),
      );
      if (!response.AudioStream) throw new Error('Polly returned no audio');
      return response.AudioStream.transformToByteArray();
    },
  };
}
