import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

process.env.LAB_STORAGE_MODE = 'demo';

const { cancelApiJob, enqueueApiJob, getApiJob, listApiJobs, registerApiJobHandler } =
  await import('../../backend/src/services/apiJobs');
const { AppError } = await import('../../backend/src/http/errors');

async function waitForJob(id: string, ownerId: string, timeoutMs = 5_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const job = await getApiJob(id, ownerId);
    if (job?.status === 'succeeded' || job?.status === 'failed') return job;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Job did not reach a terminal state.');
}

test('job payloads are owner-isolated, idempotent and do not expose owner IDs in lists', async () => {
  const type = `unit-success-${randomUUID()}`;
  const ownerId = randomUUID();
  registerApiJobHandler(type, payload => ({ value: (payload as { value: number }).value }));

  const created = await enqueueApiJob(ownerId, type, { value: 42 }, 'same-request');
  const repeated = await enqueueApiJob(ownerId, type, { value: 42 }, 'same-request');
  assert.equal(repeated.id, created.id);
  assert.equal(await getApiJob(created.id, randomUUID()), null);
  await assert.rejects(enqueueApiJob(ownerId, type, { value: 43 }, 'same-request'),
    (error: unknown) => error instanceof AppError && error.statusCode === 409);

  const finished = await waitForJob(created.id, ownerId);
  assert.equal(finished.status, 'succeeded');
  assert.deepEqual(finished.result, { value: 42 });
  const listed = await listApiJobs(ownerId, type);
  assert.equal(listed.length, 1);
  assert.equal('ownerId' in listed[0], false);
  assert.equal(await getApiJob(created.id, ownerId).then(job => job?.attempts), 1);
});

test('transient job failures retry within a bounded attempt count', async () => {
  const type = `unit-retry-${randomUUID()}`;
  const ownerId = randomUUID();
  let executions = 0;
  registerApiJobHandler(type, () => {
    executions += 1;
    if (executions === 1) throw new AppError('temporary failure', 503, 'TEMPORARY');
    return { recovered: true };
  });

  const created = await enqueueApiJob(ownerId, type, {});
  const finished = await waitForJob(created.id, ownerId);
  assert.equal(finished.status, 'succeeded');
  assert.equal(finished.attempts, 2);
  assert.equal(executions, 2);
});

test('only queued jobs can be cancelled and invalid idempotency keys are rejected', async () => {
  const type = `unit-cancel-${randomUUID()}`;
  const ownerId = randomUUID();
  let release: (() => void) | undefined;
  registerApiJobHandler(type, () => new Promise(resolve => { release = () => resolve('done'); }));
  const created = await enqueueApiJob(ownerId, type, {});
  await assert.rejects(enqueueApiJob(ownerId, type, {}, 'invalid key with spaces'),
    (error: unknown) => error instanceof AppError && error.statusCode === 400);

  for (let attempt = 0; attempt < 100 && !release; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  assert.ok(release);
  assert.equal(await cancelApiJob(created.id, ownerId), false);
  release();
  assert.equal((await waitForJob(created.id, ownerId)).status, 'succeeded');
});