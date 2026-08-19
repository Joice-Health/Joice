import {
  emptyMemberContext,
  type MemberContext,
  type MemberContextPort,
  type ObservationSinkPort,
} from '@joice/brain';

/**
 * The platform over HTTP: the promised replacement for the stub ports
 * ("the stubs become HTTP clients to the api service and nothing in the
 * domain changes", docs/rag/10-architecture.md). Talks to /api/internal/* on
 * the api with the shared bearer token; today over the canonical URL, later
 * over Service Connect (story 4.7). Failures degrade, never break: an
 * unreachable api yields the empty member context and a swallowed
 * observation, each with one log line, because a chat answer must not depend
 * on a second service being up.
 */
export function createPlatformPorts(opts: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): { memberContext: MemberContextPort; observations: ObservationSinkPort } {
  const { baseUrl, token, fetchImpl = fetch, timeoutMs = 1500 } = opts;

  async function call(path: string, init?: RequestInit): Promise<Response> {
    return fetchImpl(`${baseUrl}/api/internal${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...init?.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  return {
    memberContext: {
      async forMember(memberId: string): Promise<MemberContext> {
        try {
          const res = await call(`/profile/${memberId}`);
          if (!res.ok) {
            if (res.status !== 404) console.warn(`platform profile read failed (${res.status})`);
            return emptyMemberContext;
          }
          const body = (await res.json()) as {
            firstName: string | null;
            goalLabel: string | null;
            segment: string | null;
            traits: Array<{ key: string; label: string; value: string }>;
          };
          return {
            firstName: body.firstName,
            goalLabel: body.goalLabel,
            segment: body.segment,
            traitsSummary: body.traits
              // Identity and derived internals are covered by the named fields
              // (or are nobody's business in a prompt: the raw date of birth).
              .filter(
                (t) =>
                  !['us_state', 'goal', 'first_name', 'email', 'segment', 'date_of_birth', 'age_band', 'age_eligible', 'state_status'].includes(
                    t.key,
                  ),
              )
              .map((t) => `${t.label}: ${t.value}`),
            // Orders and protocols arrive with commerce; the shape is ready.
            orders: [],
            protocols: [],
          };
        } catch (error) {
          console.warn(`platform profile read failed (${(error as Error).message?.slice(0, 120)})`);
          return emptyMemberContext;
        }
      },
    },
    observations: {
      async record(input) {
        try {
          const res = await call('/observations', { method: 'POST', body: JSON.stringify(input) });
          if (!res.ok) console.warn(`platform observation write failed (${res.status})`);
        } catch (error) {
          console.warn(`platform observation write failed (${(error as Error).message?.slice(0, 120)})`);
        }
      },
    },
  };
}
