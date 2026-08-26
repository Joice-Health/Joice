import { describe, expect, test } from 'bun:test';
import { createPlatformPorts } from './platform-client';

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as typeof fetch;
  return { impl, calls };
}

describe('platform ports over HTTP', () => {
  test('a member profile maps to the context shape, identity lines filtered from the summary', async () => {
    const { impl, calls } = fakeFetch(() =>
      Response.json({
        firstName: 'Sam',
        goalLabel: 'Energy',
        segment: 'energy',
        traits: [
          { key: 'us_state', label: 'State', value: 'California' },
          { key: 'date_of_birth', label: 'Date of birth', value: '1983-02-04' },
          { key: 'segment', label: 'Segment', value: 'energy' },
          { key: 'goal_timeline', label: 'Timeline', value: 'About six months' },
        ],
      }),
    );
    const ports = createPlatformPorts({ baseUrl: 'http://api:4000', token: 't0k', fetchImpl: impl });
    const ctx = await ports.memberContext.forMember('mem-1');
    expect(ctx).toMatchObject({ firstName: 'Sam', goalLabel: 'Energy', segment: 'energy', traitsSummary: ['Timeline: About six months'] });
    expect(calls[0]!.url).toBe('http://api:4000/api/internal/profile/mem-1');
    expect((calls[0]!.init!.headers as Record<string, string>).authorization).toBe('Bearer t0k');
  });

  test('a failed or 404 read degrades to the empty context, never throws', async () => {
    const notFound = createPlatformPorts({ baseUrl: 'x://', token: 't', fetchImpl: fakeFetch(() => new Response('', { status: 404 })).impl });
    expect(await notFound.memberContext.forMember('m')).toMatchObject({ firstName: null, traitsSummary: [] });
    const down = createPlatformPorts({ baseUrl: 'x://', token: 't', fetchImpl: (() => { throw new Error('boom'); }) as never });
    expect(await down.memberContext.forMember('m')).toMatchObject({ firstName: null });
  });

  test('observations post and swallow failures', async () => {
    const { impl, calls } = fakeFetch(() => Response.json({ recorded: 1 }, { status: 201 }));
    const ports = createPlatformPorts({ baseUrl: 'http://api:4000', token: 't', fetchImpl: impl });
    await ports.observations.record({ memberId: 'm', observations: [{ trait: 'goal', value: 'energy' }] });
    expect(calls[0]!.url).toBe('http://api:4000/api/internal/observations');
    const down = createPlatformPorts({ baseUrl: 'x://', token: 't', fetchImpl: (() => { throw new Error('boom'); }) as never });
    await down.observations.record({ memberId: 'm', observations: [{ trait: 'goal', value: 'x' }] });
  });
});
