import { clearDemoSession, getAccessToken } from './demoSession';
import { isRecord } from './typeGuards';

export const SESSION_EXPIRED_EVENT = 'dimension-lab:session-expired';

export class ApiError extends Error {
  readonly status: number;
  readonly requestId: string | null;
  readonly code: string | undefined;
  readonly jsonResponse: boolean;

  constructor(response: Response, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = response.status;
    this.requestId = response.headers.get('X-Request-Id');
    this.code = code;
    this.jsonResponse = response.headers.get('Content-Type')?.includes('application/json') ?? false;
  }
}

export class NetworkError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = 'NetworkError';
  }
}

export function isServiceUnavailable(error: unknown) {
  return error instanceof NetworkError || (error instanceof ApiError
    && ([502, 503, 504].includes(error.status) || (error.status === 500 && !error.jsonResponse)));
}

export async function readApiData(response: Response, errorMessage = 'Request failed'): Promise<unknown> {
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
    throw new ApiError(response, typeof error?.message === 'string' ? error.message : errorMessage + ' (HTTP ' + response.status + ').',
      typeof error?.code === 'string' ? error.code : undefined);
  }
  if (!isRecord(body) || body.success !== true || !Object.hasOwn(body, 'data')) {
    throw new ApiError(response, 'The server returned an invalid API response.');
  }
  return body.data;
}

export async function requestApi(url: string, options?: RequestInit, timeoutMs?: number) {
  return readApiData(await fetchWithTimeout(url, options, timeoutMs));
}

export function jsonRequest(method: 'POST' | 'PATCH', body: unknown, signal?: AbortSignal): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...(signal && { signal }) };
}

/** Bound waits without swallowing a caller's cancellation. */
export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  let timedOut = false;
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const token = url.startsWith('/api/') && url !== '/api/auth/login' ? getAccessToken() : null;
    const headers = new Headers(options.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers, signal: controller.signal });
    if (response.status === 401 && url.startsWith('/api/') && url !== '/api/auth/login'
      && url !== '/api/auth/logout' && url !== '/api/auth/verify-email' && token === getAccessToken() && typeof window !== 'undefined') {
      clearDemoSession();
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    return response;
  } catch (error) {
    if (timedOut) throw new NetworkError('The server took too long to respond. Check your connection and try again.', error);
    if (controller.signal.aborted) throw error;
    throw new NetworkError(error instanceof Error ? error.message : 'Could not reach the server.', error);
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); }
}
