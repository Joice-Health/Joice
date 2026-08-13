/**
 * Klaviyo HTTP client — the marketing swap seam. Domain-agnostic on purpose:
 * the waitlist, onboarding checkpoints, and anything else that talks to
 * Klaviyo goes through this one client, each behind its own narrow port.
 * Moving to a different marketing platform later only touches this package.
 *
 * Uses Klaviyo's JSON:API (https://developers.klaviyo.com/en/reference):
 * profile-import is an idempotent upsert keyed on email, subscription jobs
 * grant email marketing consent + list membership, and events are the
 * primitive Klaviyo flows/segments trigger on — one metric per checkpoint.
 */

const KLAVIYO_BASE_URL = 'https://a.klaviyo.com';

/** Pinned API revision — bump deliberately, alongside a read of the changelog. */
const KLAVIYO_REVISION = '2026-07-15';

const RETRY_ATTEMPTS = 5;

export interface KlaviyoClientOptions {
  apiKey: string;
  /** Override the pinned `revision` header (tests, staged upgrades). */
  revision?: string;
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface ImportProfileInput {
  email: string;
  /** Our stable id for the person (e.g. the waitlist entry UUID). */
  externalId?: string;
  firstName?: string | null;
  lastName?: string | null;
  /** Custom properties shown on the Klaviyo profile, usable in segments. */
  properties?: Record<string, unknown>;
}

export interface KlaviyoClient {
  /** Idempotent profile upsert by email (POST /api/profile-import/). */
  importProfile(input: ImportProfileInput): Promise<void>;
  /**
   * Email marketing consent + list membership in one call
   * (POST /api/profile-subscription-bulk-create-jobs/). The job is async on
   * Klaviyo's side; a 202 means accepted, which is all we need.
   * `customSource` lands in Klaviyo's consent audit trail (`custom_method_detail`).
   */
  subscribeToList(listId: string, email: string, customSource?: string): Promise<void>;
  /**
   * Record a checkpoint metric (POST /api/events/) — names come from METRICS.
   * Metrics are what flows and segments key on, so every future checkpoint
   * is just a new metric name; no new lists or schema. Pass `uniqueId` (e.g.
   * the domain entity's id) so a retried or re-pushed event never double-fires.
   */
  trackEvent(
    metricName: string,
    email: string,
    properties?: Record<string, unknown>,
    uniqueId?: string,
  ): Promise<void>;
  /**
   * Suppress a profile from all email marketing
   * (POST /api/profile-suppression-bulk-create-jobs/). The erasure primitive:
   * deleting someone locally without suppressing them in Klaviyo would keep
   * marketing them after they asked to be forgotten.
   */
  suppressProfile(email: string): Promise<void>;
}

export function createKlaviyoClient(opts: KlaviyoClientOptions): KlaviyoClient {
  const { apiKey, revision = KLAVIYO_REVISION, fetchImpl = fetch } = opts;

  async function post(path: string, body: unknown): Promise<void> {
    await withRetry(async () => {
      const response = await fetchImpl(`${KLAVIYO_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Klaviyo-API-Key ${apiKey}`,
          revision,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        // Body is truncated and the key never included — this surfaces in logs.
        const detail = (await response.text().catch(() => '')).slice(0, 500);
        throw new KlaviyoRequestError(path, response.status, detail, retryAfterMs(response));
      }
    });
  }

  return {
    async importProfile(input) {
      await post('/api/profile-import/', {
        data: {
          type: 'profile',
          attributes: {
            email: input.email,
            ...(input.externalId ? { external_id: input.externalId } : {}),
            ...(input.firstName ? { first_name: input.firstName } : {}),
            ...(input.lastName ? { last_name: input.lastName } : {}),
            ...(input.properties ? { properties: input.properties } : {}),
          },
        },
      });
    },

    async subscribeToList(listId, email, customSource) {
      await post('/api/profile-subscription-bulk-create-jobs/', {
        data: {
          type: 'profile-subscription-bulk-create-job',
          attributes: {
            ...(customSource ? { custom_source: customSource } : {}),
            profiles: {
              data: [
                {
                  type: 'profile',
                  attributes: {
                    email,
                    subscriptions: { email: { marketing: { consent: 'SUBSCRIBED' } } },
                  },
                },
              ],
            },
          },
          relationships: { list: { data: { type: 'list', id: listId } } },
        },
      });
    },

    async suppressProfile(email) {
      await post('/api/profile-suppression-bulk-create-jobs/', {
        data: {
          type: 'profile-suppression-bulk-create-job',
          attributes: {
            profiles: {
              data: [{ type: 'profile', attributes: { email } }],
            },
          },
        },
      });
    },

    async trackEvent(metricName, email, properties = {}, uniqueId) {
      await post('/api/events/', {
        data: {
          type: 'event',
          attributes: {
            metric: { data: { type: 'metric', attributes: { name: metricName } } },
            profile: { data: { type: 'profile', attributes: { email } } },
            properties,
            ...(uniqueId ? { unique_id: uniqueId } : {}),
          },
        },
      });
    },
  };
}

export class KlaviyoRequestError extends Error {
  constructor(
    path: string,
    readonly status: number,
    detail: string,
    readonly retryAfterMs?: number,
  ) {
    super(`Klaviyo ${path} responded ${status}${detail ? `: ${detail}` : ''}`);
    this.name = 'KlaviyoRequestError';
  }
}

function retryAfterMs(response: Response): number | undefined {
  const seconds = Number(response.headers.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof KlaviyoRequestError) return error.status === 429 || error.status >= 500;
  // Transport-level failures (fetch throws before a response exists).
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
        error instanceof KlaviyoRequestError && error.retryAfterMs
          ? Math.max(error.retryAfterMs, backoff)
          : backoff;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
