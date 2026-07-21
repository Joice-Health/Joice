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

export interface SpeechClient {
  /** Plain text → mp3 bytes. */
  synthesize(text: string): Promise<Uint8Array>;
}

export function createSpeechClient(opts: { region: string; voiceId: string }): SpeechClient {
  const client = new PollyClient({ region: opts.region });

  return {
    async synthesize(text) {
      const response = await client.send(
        new SynthesizeSpeechCommand({
          Engine: 'neural',
          VoiceId: opts.voiceId as VoiceId,
          OutputFormat: 'mp3',
          Text: text,
        }),
      );
      if (!response.AudioStream) throw new Error('Polly returned no audio');
      return response.AudioStream.transformToByteArray();
    },
  };
}
