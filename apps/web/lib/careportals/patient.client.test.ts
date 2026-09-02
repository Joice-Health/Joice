import { describe, expect, test } from 'bun:test';
import {
  PatientAuthError,
  PatientEmailInUseError,
  createPatientAccount,
  createPatientSessionForTest,
  loginPatient,
} from './patient.client';

const SIGNUP = {
  email: 'buyer@example.com',
  firstName: 'Test',
  lastName: 'Buyer',
  gender: 'female',
  phone: '+15555550100',
  dob: '1990-01-01',
  password: 'a-long-password',
};

function fakeFetch(status: number, body?: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { impl, calls };
}

describe('createPatientAccount', () => {
  test('201 resolves quietly (no token comes back for this org)', async () => {
    const { impl, calls } = fakeFetch(201, { _id: 'u1' });
    await createPatientAccount(SIGNUP, impl);
    expect(calls[0]!.url).toBe('https://patient-api.portals.care/users');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.organization).toBe('joicehealth_com');
  });

  test('409 is the email-in-use signal', async () => {
    const { impl } = fakeFetch(409, { message: 'Account Exists Already' });
    expect(createPatientAccount(SIGNUP, impl)).rejects.toBeInstanceOf(PatientEmailInUseError);
  });

  test('406 (the validation status) throws plain', async () => {
    const { impl } = fakeFetch(406, { message: 'Failed to create account' });
    expect(createPatientAccount(SIGNUP, impl)).rejects.toThrow('Account create failed (406)');
  });
});

describe('loginPatient', () => {
  test('resolves the token and sends Bearer-free headers', async () => {
    const { impl, calls } = fakeFetch(201, { token: 'jwt-value' });
    const token = await loginPatient({ username: 'buyer@example.com', password: 'pw' }, impl);
    expect(token).toBe('jwt-value');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
  });

  test('bad credentials are a PatientAuthError', async () => {
    const { impl } = fakeFetch(401, { message: 'nope' });
    expect(loginPatient({ username: 'a@b.co', password: 'x' }, impl)).rejects.toBeInstanceOf(
      PatientAuthError,
    );
  });

  test('a token-less success is an error, not a silent null', async () => {
    const { impl } = fakeFetch(201, {});
    expect(loginPatient({ username: 'a@b.co', password: 'x' }, impl)).rejects.toThrow(
      'without a token',
    );
  });
});

describe('patientSession', () => {
  function fakeStorage(): Storage {
    const map = new Map<string, string>();
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
      clear: () => map.clear(),
      key: () => null,
      get length() {
        return map.size;
      },
    };
  }

  test('set, get, clear round-trip through storage', () => {
    const session = createPatientSessionForTest(() => fakeStorage());
    // A fresh storage per call still works because memory backs it.
    session.set('tok');
    expect(session.get()).toBe('tok');
    session.clear();
    expect(session.get()).toBeNull();
  });

  test('a throwing storage falls back to memory', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const session = createPatientSessionForTest(() => broken);
    session.set('tok');
    expect(session.get()).toBe('tok');
    session.clear();
    expect(session.get()).toBeNull();
  });
});
