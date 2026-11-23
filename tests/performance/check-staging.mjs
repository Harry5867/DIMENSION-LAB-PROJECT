const address = process.env.LAB_STAGING_URL ?? '';
if (!/^https:\/\/[a-z0-9][a-z0-9.-]+(?::\d+)?\/?$/i.test(address)) {
  throw new Error('Set LAB_STAGING_URL to the HTTPS origin of staging.');
}
const origin = new URL(address);

const started = performance.now();
try {
  const response = await fetch(new URL('/api/health', origin), { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  console.log(JSON.stringify({ event: 'staging.health', status: response.status, requestId: response.headers.get('x-request-id'),
    durationMs: Math.round(performance.now() - started) }));
  const body = await response.json();
  if (!response.ok || body.success !== true || body.data?.status !== 'ok') process.exitCode = 1;
} catch {
  console.error('Staging health check failed or timed out.');
  process.exitCode = 1;
}
