import { CAREPORTALS_PATIENT_BASE_URL, careportalsHeaders } from './types';

/**
 * Browser-side Patient API module: account creation and login for the custom
 * checkout (docs/shop/01-commerce.md section 6). Call only from client
 * components.
 *
 * Compliance stance: the fields here (name, phone, date of birth, sex) are
 * the buyer's medical account with our pharmacy partner. They go
 * browser-direct to CarePortals (CORS is open with credentials, verified
 * live) and never transit or persist on Joice servers; nothing in this module
 * may be logged or sent to analytics. The JWT payload itself carries PII, so
 * the same rule covers the token.
 *
 * Verified live 2026-09-01: POST /users answers 201 WITHOUT a token for this
 * org (the reference schema lies; the guide's create-then-login flow is
 * authoritative), a duplicate email answers 409, and POST /auth/login works
 * without the documented Authorization header and returns a 30-day JWT.
 */

/** The email already has a CarePortals account; the UI flips to sign-in mode. */
export class PatientEmailInUseError extends Error {
  constructor() {
    super('Account exists already');
    this.name = 'PatientEmailInUseError';
  }
}

/** Bad credentials or an expired/rejected JWT; the UI returns to sign-in. */
export class PatientAuthError extends Error {
  constructor(message = 'Not signed in') {
    super(message);
    this.name = 'PatientAuthError';
  }
}

export interface PatientSignupInput {
  email: string;
  firstName: string;
  lastName: string;
  gender: string;
  phone: string;
  dob: string; // YYYY-MM-DD
  password: string;
}

export interface PatientLoginInput {
  username: string;
  password: string;
}

type FetchImpl = typeof fetch;

const TIMEOUT_MS = 15_000;

/**
 * Create the patient account. Resolves on success (no token comes back;
 * follow with loginPatient), throws PatientEmailInUseError on 409 so the
 * contact step can flip to sign-in with the email kept.
 */
export async function createPatientAccount(
  input: PatientSignupInput,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  const res = await fetchImpl(`${CAREPORTALS_PATIENT_BASE_URL}/users`, {
    method: 'POST',
    headers: careportalsHeaders,
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 409) throw new PatientEmailInUseError();
  if (!res.ok) throw new Error(`Account create failed (${res.status})`);
}

/** Log in; resolves the patient JWT. 400/401 mean bad credentials. */
export async function loginPatient(
  input: PatientLoginInput,
  fetchImpl: FetchImpl = fetch,
): Promise<string> {
  const res = await fetchImpl(`${CAREPORTALS_PATIENT_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: careportalsHeaders,
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 400 || res.status === 401) {
    throw new PatientAuthError('Sign-in failed');
  }
  if (!res.ok) throw new Error(`Sign-in failed (${res.status})`);
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error('Sign-in answered without a token');
  return body.token;
}

const JWT_KEY = 'joice.checkout.patientJwt';

/**
 * Where the patient JWT lives for the checkout session: sessionStorage, so a
 * refresh or a bank's redirect-mode 3DS hop does not lose the session at the
 * exact moment money moved, with an in-memory fallback for storage-blocked
 * browsers. Deliberately never localStorage, never logged, never sent to our
 * own APIs. Cleared on the confirmation page and whenever checkout restarts.
 */
function makePatientSession(storage: () => Storage | null) {
  let memory: string | null = null;
  return {
    get(): string | null {
      try {
        return storage()?.getItem(JWT_KEY) ?? memory;
      } catch {
        return memory;
      }
    },
    set(token: string): void {
      memory = token;
      try {
        storage()?.setItem(JWT_KEY, token);
      } catch {
        // Storage blocked: the in-memory copy carries the session.
      }
    },
    clear(): void {
      memory = null;
      try {
        storage()?.removeItem(JWT_KEY);
      } catch {
        // Nothing to clear.
      }
    },
  };
}

/** Exposed for tests only. */
export const createPatientSessionForTest = makePatientSession;

export const patientSession = makePatientSession(() =>
  typeof window === 'undefined' ? null : window.sessionStorage,
);
