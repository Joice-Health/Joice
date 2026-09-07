/**
 * Attentive HTTP client, the marketing swap seam. Domain-agnostic on purpose:
 * the waitlist, the intake checkpoints, the companion's lead capture and
 * anything else that talks to Attentive goes through this one client, each
 * behind its own narrow port. Moving to another platform touches this package.
 *
 * Attentive's REST API (https://docs.attentive.com): custom attributes are an
 * idempotent upsert keyed on email or phone, the subscriptions call grants
 * consent through a sign-up unit, and custom events are the primitive that
 * journeys and segments trigger on, one event type per checkpoint.
 */

import type { EventName } from './events';

const ATTENTIVE_BASE_URL = 'https://api.attentivemobile.com';

const RETRY_ATTEMPTS = 5;

/** A stalled socket must never hold a fire-and-forget chain (or a row lock) open. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** E.164: a plus, a non-zero first digit, at most fifteen digits in all. */
const E164 = /^\+[1-9]\d{1,14}$/;

export interface AttentiveClientOptions {
  apiKey: string;
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Per-request wall clock (AbortSignal.timeout). Default 10 s. */
  timeoutMs?: number;
  /** Override the retry budget (tests). */
  retryAttempts?: number;
}

export interface AttentiveUser {
  email?: string;
  /** E.164 (+15555550123). No surface captures one yet; carried so SMS is one story. */
  phone?: string;
  /** Our stable id for the person. Only the waitlist sends it (the entry UUID). */
  clientUserId?: string;
}

/**
 * Custom attribute and event property values: scalars only. Attentive rejects
 * arrays, and a key's type is fixed by the first value ever written to it.
 */
export type AttributeValue = string | number | boolean;

export interface UpsertProfileInput {
  user: AttentiveUser;
  /** Blank values are omitted so a sync can never clear a name. */
  firstName?: string | null;
  lastName?: string | null;
  /** Custom attributes shown on the subscriber, usable in segments and templates. */
  properties?: Record<string, AttributeValue>;
}

/** GET /v1/me: who the key belongs to. */
export interface AttentiveAccount {
  applicationName: string;
  attentiveDomainName: string;
  companyName: string;
  contactEmail: string;
  companyId: string;
}

export interface AttentiveClient {
  /**
   * Idempotent profile upsert: POST /v1/attributes/custom (synchronous) for
   * the properties, then POST /v2/user/attributes (asynchronous, the only
   * endpoint that sets first and last name) when a name is present. Properties
   * go first because the event that follows may start a journey that renders
   * them; a name lagging a few seconds never gates anything.
   */
  upsertProfile(input: UpsertProfileInput): Promise<void>;
  /**
   * Consent through an API sign-up unit (POST /v1/subscriptions). Subscribes
   * every channel the user object identifies: an email alone subscribes email
   * only. A 202 means accepted, which is all we need. Attentive records the
   * sign-up unit as the consent provenance.
   */
  subscribe(input: { user: AttentiveUser; signUpSourceId: string }): Promise<void>;
  /**
   * Record a checkpoint (POST /v1/events/custom); types come from EVENTS.
   * Pass `externalEventId` (the domain entity's id) so a retried or re-pushed
   * sync never double-fires a journey, and `occurredAt` (the row's own time):
   * an event older than twelve hours is recorded but starts no journey.
   */
  trackEvent(
    type: EventName,
    user: AttentiveUser,
    properties?: Record<string, AttributeValue>,
    opts?: { externalEventId?: string; occurredAt?: Date },
  ): Promise<void>;
  /**
   * Unsubscribe from every channel (POST /v1/subscriptions/unsubscribe). The
   * confirmation message is suppressed unless `notify` is true.
   */
  unsubscribe(user: AttentiveUser, opts?: { notify?: boolean }): Promise<void>;
  /**
   * The erasure primitive (POST /v1/privacy/delete-request): Attentive deletes
   * the person within thirty days. Deleting someone locally without this would
   * keep marketing to them after they asked to be forgotten.
   */
  requestDeletion(user: AttentiveUser, requestMsg?: string): Promise<void>;
  /** GET /v1/me, for the key check script. */
  me(): Promise<AttentiveAccount>;
}

export function createAttentiveClient(opts: AttentiveClientOptions): AttentiveClient {
  const {
    apiKey,
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryAttempts = RETRY_ATTEMPTS,
  } = opts;

  async function request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response> {
    return withRetry(async () => {
      const response = await fetchImpl(`${ATTENTIVE_BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        // Body is truncated and the key never included; this surfaces in logs.
        const detail = (await response.text().catch(() => '')).slice(0, 500);
        throw new AttentiveRequestError(path, response.status, detail, retryAfterMs(response));
      }
      return response;
    }, retryAttempts);
  }

  async function post(path: string, body: unknown): Promise<void> {
    await request('POST', path, body);
  }

  return {
    async upsertProfile(input) {
      const user = assertIdentified(input.user);
      if (input.properties && Object.keys(input.properties).length > 0) {
        await post('/v1/attributes/custom', { user: v1User(user), properties: input.properties });
      }
      const firstName = input.firstName?.trim();
      const lastName = input.lastName?.trim();
      if (firstName || lastName) {
        await post('/v2/user/attributes', {
          identifiers: v2Identifiers(user),
          attributes: {
            ...(firstName ? { firstName } : {}),
            ...(lastName ? { lastName } : {}),
          },
        });
      }
    },

    async subscribe({ user, signUpSourceId }) {
      await post('/v1/subscriptions', { user: v1User(assertIdentified(user)), signUpSourceId });
    },

    async trackEvent(type, user, properties, eventOpts) {
      await post('/v1/events/custom', {
        type,
        user: v1User(assertIdentified(user)),
        ...(properties ? { properties } : {}),
        ...(eventOpts?.externalEventId ? { externalEventId: eventOpts.externalEventId } : {}),
        ...(eventOpts?.occurredAt ? { occurredAt: eventOpts.occurredAt.toISOString() } : {}),
      });
    },

    async unsubscribe(user, unsubscribeOpts) {
      const { email, phone } = assertIdentified(user);
      await post('/v1/subscriptions/unsubscribe', {
        user: { ...(email ? { email } : {}), ...(phone ? { phone } : {}) },
        notification: { disabled: !(unsubscribeOpts?.notify ?? false) },
      });
    },

    async requestDeletion(user, requestMsg) {
      const { email, phone, clientUserId } = assertIdentified(user);
      await post('/v1/privacy/delete-request', {
        ...(email ? { subjectEmail: email } : {}),
        ...(phone ? { subjectPhone: phone } : {}),
        ...(clientUserId ? { clientUserId } : {}),
        ...(requestMsg ? { requestMsg } : {}),
      });
    },

    async me() {
      const response = await request('GET', '/v1/me');
      return (await response.json()) as AttentiveAccount;
    },
  };
}

export class AttentiveRequestError extends Error {
  constructor(
    path: string,
    readonly status: number,
    detail: string,
    readonly retryAfterMs?: number,
  ) {
    super(`Attentive ${path} responded ${status}${detail ? `: ${detail}` : ''}`);
    this.name = 'AttentiveRequestError';
  }
}

/** The v1 `user` object (attributes, events, subscriptions). */
function v1User(user: AttentiveUser) {
  return {
    ...(user.email ? { email: user.email } : {}),
    ...(user.phone ? { phone: user.phone } : {}),
    ...(user.clientUserId ? { externalIdentifiers: { clientUserId: user.clientUserId } } : {}),
  };
}

/** The v2 `identifiers` object (user attributes). */
function v2Identifiers(user: AttentiveUser) {
  return {
    ...(user.email ? { email: user.email } : {}),
    ...(user.phone ? { phone: user.phone } : {}),
    ...(user.clientUserId ? { clientUserId: user.clientUserId } : {}),
  };
}

/**
 * A request with nobody to attach it to, or a phone Attentive would reject, is
 * a programming error: a TypeError, thrown before any request, never retried.
 * The messages carry no values (an email or phone is PII in a log line).
 */
function assertIdentified(user: AttentiveUser): AttentiveUser {
  if (!user.email && !user.phone) throw new TypeError('Attentive user needs an email or a phone');
  if (user.phone && !E164.test(user.phone)) throw new TypeError('Attentive phone must be E.164');
  return user;
}

function retryAfterMs(response: Response): number | undefined {
  const seconds = Number(response.headers.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof AttentiveRequestError) return error.status === 429 || error.status >= 500;
  if (error instanceof TypeError) return false;
  // Transport-level failures (fetch throws before a response exists), including
  // the AbortSignal timeout, whose reason is named TimeoutError.
  return /ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|socket|network|timed? ?out/i.test(
    `${(error as Error)?.name ?? ''} ${(error as Error)?.message ?? ''}`,
  );
}

/** Retry transient transport/throttle failures with exponential backoff + jitter. */
async function withRetry<T>(operation: () => Promise<T>, attempts = RETRY_ATTEMPTS): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts - 1) throw error;
      const backoff = 500 * 2 ** attempt + Math.floor(Math.random() * 250);
      const delay =
        error instanceof AttentiveRequestError && error.retryAfterMs
          ? Math.max(error.retryAfterMs, backoff)
          : backoff;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
