import type { AuthOptions } from '@dimension-lab/contracts';
import { ApiError, jsonRequest, requestApi } from '../../shared/api/network';
import { isRecord } from '../../shared/api/typeGuards';

export async function getAuthOptions(signal: AbortSignal): Promise<AuthOptions> {
  const data = await requestApi('/api/auth/options', { signal }, 5000);
  if (!isRecord(data) || (data.mode !== 'atlas' && data.mode !== 'demo')) throw new Error('Invalid sign-in options.');
  return { mode: data.mode, google: data.google === true, registration: data.registration === true };
}

export async function getSession(signal: AbortSignal) {
  const data = await requestApi('/api/auth/me', { signal });
  if (!isRecord(data) || typeof data.authenticated !== 'boolean') throw new Error('Invalid session response.');
  return { authenticated: data.authenticated, email: typeof data.email === 'string' ? data.email : undefined };
}

export async function signIn(body: { email: string; password: string; enroll?: true } | { challenge: string; code: string },
  atlas: boolean, signal: AbortSignal) {
  const path = 'challenge' in body ? '/api/auth/verify-email' : '/api/auth/login';
  const data = await requestApi(path, jsonRequest('POST', body, signal), atlas ? 15_000 : 5_000);
  if (isRecord(data)) {
    if (atlas && data.verificationRequired === true && typeof data.challenge === 'string') {
      return { kind: 'challenge' as const, challenge: data.challenge };
    }
    if (atlas && data.authenticated === true) return { kind: 'authenticated' as const };
    if (!atlas && typeof data.token === 'string') return { kind: 'demo' as const, token: data.token };
  }
  throw new Error('Invalid sign-in response.');
}

export async function logout() {
  try {
    await requestApi('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
  }
}
