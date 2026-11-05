/** Bound waits without swallowing a caller's cancellation. */
export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  let timedOut = false;
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  catch (error) {
    if (timedOut) throw new Error('The server took too long to respond. Check your connection and try again.');
    throw error;
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); }
}
