# 04 — Query Flow & API

## The full request lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser (/ask)
    participant CF as CloudFront + ALB
    participant API as Hono API
    participant T as Bedrock Titan
    participant PG as Postgres (pgvector)
    participant C as Bedrock chat model (Claude / Nova)

    B->>CF: POST /api/peptide-recommendations/stream<br/>{ messages: [...] }
    CF->>API: (origin-lock header verified, caching disabled)
    API->>API: rate limit (5/min/IP) · zValidator(chatRequestSchema)
    API->>T: InvokeModel — embed(last user message) → 1024-dim vector
    API->>PG: SELECT ... ORDER BY embedding <=> $vec LIMIT 8
    API->>API: keep rows with similarity ≥ 0.4

    alt no chunks survive the floor
        API-->>B: SSE: delta("not covered...") + complete (Claude never called)
    else chunks retrieved
        API->>C: ConverseStream — system + conversation + numbered documents
        loop generation
            C-->>API: text delta (with inline [n] markers)
            API-->>B: SSE event: delta {text}
        end
        API->>API: parseCitations() — [n] markers → citation list
        API-->>B: SSE event: complete {answer, citations}
    end
```

## Endpoints

Both live in the single route chain in `apps/api/src/app.ts` (the AppType
contract), both rate-limited **5 requests/min/IP** (each route has its own
in-memory window), both validated against `chatRequestSchema` from
`@joice/core`.

### Request body (both endpoints)

```jsonc
{
  "messages": [
    { "role": "user",      "content": "Tell me about BPC-157" },
    { "role": "assistant", "content": "BPC-157 is a peptide..." },
    { "role": "user",      "content": "How is it dosed?" }        // last MUST be user
  ]
}
```

Validation rules (`chatRequestSchema`): 1–20 messages; each `content` trimmed,
1–2,000 chars; `role` ∈ `user | assistant`; the **last message must be from the
user**. Violations → `400` from zValidator. The conversation is stateless —
the client resends the visible history each turn (the web component caps it at
20 client-side too).

Retrieval uses **only the last user message** as the query; the earlier turns
are still sent to Claude for conversational context. (Query rewriting from
history — e.g. resolving "how is *it* dosed?" into "how is BPC-157 dosed?"
before embedding — is a known future improvement; the breadcrumb-prefixed
embeddings soften the problem meanwhile.)

### `POST /api/peptide-recommendations` — JSON (typed-client path)

Waits for the full generation, returns:

```jsonc
{
  "answer": "Typical protocols use 250-500mcg daily.[1] Take with food.[1][2]",
  "citations": [
    {
      "index": 1,                                  // the [1] in the answer
      "sourcePath": "peptides/bpc-157.md",         // S3 key of the source note
      "headingPath": "BPC-157 > Dosing > Oral",    // null for pre-heading text
      "citedText": "250-500mcg daily"              // the exact span Claude cited
    },
    { "index": 2, "sourcePath": "peptides/absorption.md", "headingPath": "Absorption", "citedText": "with food" }
  ]
}
```

Consumed via the typed hook `usePeptideRecommendation()` from
`@joice/api-client` — full end-to-end types from the Hono AppType.

### `POST /api/peptide-recommendations/stream` — SSE (chat-UI path)

Same request, `text/event-stream` response:

| SSE `event:` | `data:` payload | Meaning |
|---|---|---|
| `delta` | `{ "text": "..." }` | A raw text fragment as the model generates — `[n]` markers stream inline |
| `complete` | the full JSON object above | Authoritative final answer + the parsed citations list. **The UI replaces the accumulated deltas with this** |
| `error` | `{ "error": "..." }` | Generation failed mid-stream; show the message, keep the conversation usable |

Client-side, `streamPeptideRecommendation(client, messages)` in
`packages/api-client/src/chat.ts` calls the endpoint through the same typed
`hc` client (inheriting base URL + headers), reads `res.body` with a
`ReadableStream` reader, parses SSE frames (split on blank lines), and yields
the events as an async generator. This is the one sanctioned exception to
"never fetch the API by hand" — SSE can't flow through TanStack hooks.

## Retrieval

Implemented in `createRecommendationService().retrieve()`
(`packages/core/src/recommendation-service.ts`):

```ts
const similarity = sql<number>`1 - (${cosineDistance(noteChunks.embedding, queryVector)})`;
rows = await db.select({ sourcePath, headingPath, content, similarity })
  .from(noteChunks)
  .orderBy(sql`${similarity} desc`)   // pgvector <=> under the hood → HNSW index
  .limit(TOP_K);                      // 8
return rows.filter(r => r.similarity >= SIMILARITY_FLOOR);  // 0.4
```

Two tunables, both constants in the service:

| Constant | Value | Effect of raising | Effect of lowering |
|---|---|---|---|
| `TOP_K` | 8 | More context per answer (more input tokens, better recall on broad questions) | Cheaper, tighter answers |
| `SIMILARITY_FLOOR` | 0.4 | More "not covered" refusals (higher precision) | More marginal chunks reach Claude (risk of tangential answers) |

**0.4 is a starting point** — cosine similarity distributions vary by embedding
model and corpus. After the real vault is ingested, sanity-check with a handful
of on-corpus and off-corpus questions and adjust. Symptom of it being too high:
questions the notes clearly cover come back "not covered". Too low: answers
citing barely-related notes.

**Zero survivors → the not-covered path.** The service returns a fixed honest
answer (see the constant `NOT_COVERED_ANSWER`) **without calling Claude** —
off-corpus questions cost one Titan embed (~free) and no generation tokens, and
structurally cannot hallucinate.

## Prompt construction

Built in `buildRequest()` (`recommendation-service.ts`) and sent through the
**model-agnostic Bedrock Converse API** (`createGenerationClient` in
`bedrock.ts`) — so `RAG_MODEL` can be any Bedrock chat model (Claude in prod,
Nova in dev; see [05](05-local-development.md)). The retrieved chunks are
numbered and inlined into the final user turn:

```
system: <the stable SYSTEM_PROMPT>

...prior conversation turns, verbatim...

user (final turn):
<documents>
[1] peptides/bpc-157.md — BPC-157 > Dosing
Sample research protocols describe 250–500 mcg once or twice daily. ...

[2] peptides/bpc-157.md — BPC-157 > Dosing > Cycling
The sample notes describe 4–8 week cycles followed by an equal break, ...
</documents>

How is it dosed?
```

Why this shape:

- **Prompt-based `[n]` citations** — the system prompt instructs the model to
  cite each claim with the source document's number in brackets; the service
  parses the markers back out. This works identically on every Bedrock model.
  (Anthropic-native citation spans were the original design, but they require
  Anthropic model access, which is gated on the account's use-case form —
  and prompt-based markers proved accurate in practice.)
- **The system prompt** (constant `SYSTEM_PROMPT` in the service) enforces:
  answer only from the documents; cite with `[n]`; say plainly when the
  documents don't cover it (or only partially); educational information,
  **not medical advice** — no diagnosing, prescribing, or individual dosing
  (defer to the clinical team); never invent sources or numbers.
- `maxTokens: 1024` bounds cost and keeps answers chat-sized. No sampling
  params.

## Citation parsing

`parseCitations()` (exported from the service, unit-tested) maps the model's
markers to structured citations:

1. Scan the answer for `[n]` markers, in first-appearance order, deduped.
2. Each `n` maps to retrieved chunk `n − 1`; markers pointing at documents
   that weren't provided are dropped defensively.
3. Build the `citations` array: footnote number, the chunk's `sourcePath` +
   `headingPath`, and a ≤200-char snippet of the chunk as `citedText`.

The markers stay inline in the answer text (they stream live, which reads
naturally in the chat UI); the chat UI renders the `citations` list as chips
under the answer (`[1] BPC-157 > Dosing`, hover shows the snippet).

## The chat UI (`apps/web/components/chat/peptide-chat.tsx`)

- Optimistically appends the user message + an empty assistant message, then
  consumes `streamPeptideRecommendation`.
- `delta` events append to the assistant bubble ("Thinking…" until the first
  one).
- `complete` **replaces** the streamed text with the annotated answer and
  attaches the citation chips.
- `error` events / thrown fetch errors render an inline error bubble; errored
  turns are excluded from the history sent on the next question.
- History is capped at 20 messages (mirror of the schema cap); a persistent
  "not medical advice" line sits under the input.
- The page (`/ask`) is inside the `(site)` route group, so pre-launch it sits
  behind the team-password gate automatically; at launch it's public site
  chrome like every other page.

## Voice mode

Voice rides on the same pipeline — the mic produces a transcript that flows
through the SSE chat flow above, and the finished answer is synthesized back.
All audio stays on AWS (Transcribe + Polly, both HIPAA-eligible under the BAA)
and is processed **in memory only** — never persisted, never logged. See
[07 — Compliance](07-compliance.md#voice) for why the browser's Web Speech API
was rejected.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser (/ask)
    participant API as Hono API
    participant T as Amazon Transcribe
    participant P as Amazon Polly

    B->>B: tap mic → getUserMedia → AudioWorklet captures PCM<br/>(live mic visualizer; VAD stops after ~1.5s silence)
    B->>B: downsample to 16kHz mono PCM16
    B->>API: POST /api/voice/transcribe (raw bytes, ≤2MB)
    API->>T: StartStreamTranscription (streamed chunks)
    T-->>API: transcript
    API-->>B: { transcript }
    B->>B: transcript auto-sends through the normal SSE chat flow
    Note over B,API: …text answer streams exactly as in the diagram above…
    B->>API: POST /api/voice/speak { text } ([n] markers stripped server-side)
    API->>P: SynthesizeSpeech (neural, POLLY_VOICE_ID)
    P-->>API: mp3
    API-->>B: audio/mpeg
    B->>B: Web Audio decode → AnalyserNode → speakers<br/>visualizer bars animate from the real signal
```

### Voice endpoints

| Endpoint | In | Out | Notes |
|---|---|---|---|
| `POST /api/voice/transcribe` | raw 16kHz mono PCM16 body (`application/octet-stream`, ≤2MB ≈ 60s) | `{ "transcript": "..." }` (empty string = nothing recognized) | 10 req/min/IP. Streams into Transcribe; nothing is stored |
| `POST /api/voice/speak` | `{ "text": "..." }` (≤3000 chars; `[n]` markers stripped server-side) | mp3 bytes (`audio/mpeg`) | 10 req/min/IP. `POLLY_VOICE_ID` env picks the neural voice (default **Ruth**) |

### Client behavior (`use-recorder.ts`, `use-speaker.ts`, `voice-visualizer.tsx`)

- **Capture is raw PCM via AudioWorklet** (ScriptProcessor fallback), *not*
  MediaRecorder — Safari's MediaRecorder emits AAC, which Transcribe rejects.
  Recording is downsampled to 16kHz mono PCM16 in the browser before upload.
- **VAD auto-stop**: after speech is first heard (RMS ≥ 0.02), ~1.5s below the
  silence threshold ends the recording; tap-stop always works; 60s hard cap.
  A recording with no detected speech never uploads ("didn't catch that").
- **Speak-back policy**: voice-asked questions get a spoken answer
  automatically; typed questions stay silent; every assistant message has a
  play/stop button.
- **The visualizer is real**: a canvas fed by `AnalyserNode.getByteFrequencyData`
  on the actual audio graph — mic input while recording, Polly playback while
  the AI talks. Color inherits `currentColor` (design tokens); honors
  `prefers-reduced-motion` with a static render.
- Failure degrades to text: mic denied / empty transcript / synth failure all
  surface a small hint and leave typing fully functional.

## Error handling summary

| Failure | Surface | Behavior |
|---|---|---|
| Invalid body | Both endpoints | `400` with zod details (zValidator) |
| Rate limited | Both | `429` + `Retry-After` (per-IP fixed window, per task instance) |
| Bedrock error before generation (creds/access/throttle) | JSON endpoint | `500 {"error": "Something went wrong..."}` via the global `onError` |
| Bedrock error mid-stream | SSE endpoint | `error` SSE event (the try/catch inside `streamSSE`), connection then closes |
| Empty corpus / off-corpus question | Both | Honest `NOT_COVERED_ANSWER`, `citations: []`, HTTP 200 |
