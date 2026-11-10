import { clearDemoSession, getAccessToken } from './demoSession';

export const SESSION_EXPIRED_EVENT = 'dimension-lab:session-expired';

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
      && url !== '/api/auth/logout' && token === getAccessToken() && typeof window !== 'undefined') {
      clearDemoSession();
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    return response;
  } catch (error) {
    if (timedOut) throw new Error('The server took too long to respond. Check your connection and try again.');
    throw error;
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); }
}
