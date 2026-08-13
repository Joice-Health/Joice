/**
 * Assembling the history a chat turn is sent with.
 *
 * Browser-safe (no AWS or Postgres imports) — the web app imports this through
 * `@joice/core/schemas`.
 *
 * Bedrock's Converse API requires the messages to begin with a user turn and
 * strictly alternate user/assistant. Two ways of trimming the visible thread
 * quietly broke that rule, and both produced the same symptom: a
 * `ValidationException` the member sees as "Something went wrong."
 *
 *   1. A flat `slice(-20)` of a `[user, assistant, …, user]` list (always an
 *      odd length) drops the leading user turn, so the history begins with an
 *      assistant. Every conversation died on question 11 — the exact point at
 *      which the cap first bites.
 *   2. Filtering out failed messages removed an assistant turn while leaving
 *      the user turn it answered, so two user turns sat side by side. Once one
 *      request failed, every later one in that conversation failed too.
 *
 * Building from completed exchanges rather than trimming a flat list makes both
 * shapes unrepresentable.
 */

/**
 * A message as the UI holds it: `error` marks a turn that never really
 * happened. Structural on purpose — `schemas.ts` re-exports this module, so
 * importing `ChatMessage` back from it would close a cycle.
 */
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

/** Structurally identical to `ChatMessage`; see the note above. */
type Turn = { role: 'user' | 'assistant'; content: string };

/**
 * How many past exchanges to carry. Ten pairs plus the new question is 21
 * messages, so the API's own cap has to allow at least that — see
 * `chatRequestSchema`.
 */
export const MAX_HISTORY_TURNS = 10;

/**
 * Per-message cap, shared with `chatMessageSchema`. History turns are clipped
 * to it here because answers can legitimately exceed it (maxAnswerTokens ≈
 * 4000+ chars) — replaying one verbatim made every follow-up a 400, and a
 * restored thread made that 400 reload-proof. The clipped tail loses a little
 * context; the request stays valid.
 */
export const MAX_MESSAGE_CHARS = 2000;

const clip = (text: string): string =>
  text.length > MAX_MESSAGE_CHARS ? text.slice(0, MAX_MESSAGE_CHARS) : text;

/**
 * Build the request history: the most recent complete exchanges, then the new
 * question. Guarantees the result starts with a user turn, alternates strictly,
 * and ends with the user — whatever state the visible thread is in.
 */
export function buildChatHistory(
  messages: readonly HistoryMessage[],
  question: string,
  maxTurns: number = MAX_HISTORY_TURNS,
): Turn[] {
  const exchanges: Array<[Turn, Turn]> = [];

  // Pair each user turn with the assistant turn that answered it. A user turn
  // with no usable answer (still streaming, errored, or empty) contributes
  // nothing: sending it alone is what breaks alternation.
  for (let i = 0; i < messages.length; i++) {
    const user = messages[i]!;
    if (user.role !== 'user' || user.error || !user.content.trim()) continue;
    const answer = messages[i + 1];
    if (!answer || answer.role !== 'assistant' || answer.error || !answer.content.trim()) continue;
    exchanges.push([
      { role: 'user', content: clip(user.content) },
      { role: 'assistant', content: clip(answer.content) },
    ]);
    i++; // consumed the answer
  }

  return [...exchanges.slice(-maxTurns).flat(), { role: 'user', content: clip(question) }];
}

/**
 * Does this sequence satisfy Converse's shape rule? Used by the request schema
 * so a malformed history is a 400 naming the problem, rather than a 500 from
 * Bedrock several layers down.
 */
export function alternatesFromUser(messages: readonly { role: string }[]): boolean {
  return messages.every((m, i) => m.role === (i % 2 === 0 ? 'user' : 'assistant'));
}
