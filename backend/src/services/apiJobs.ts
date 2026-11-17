import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../http/errors';
import { atlasDatabase, atlasMode } from '../database/atlas';
import { recordJobEvent } from '../observability/metrics';

export type ApiJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ApiJob {
  id: string;
  ownerId: string;
  type: string;
  status: ApiJobStatus;
  progress: number;
  attempts: number;
  maxAttempts: number;
  deadLetter?: boolean;
  createdAt: string;
  updatedAt: string;
  result?: unknown;
  error?: { code: string; message: string };
}

interface StoredApiJob extends ApiJob {
  payload: unknown;
  payloadHash: string;
  idempotencyKey?: string;
  createdAtDate: Date;
  runAt: Date;
  leaseUntil?: Date;
  workerId?: string;
  expiresAt?: Date;
}

export interface ApiJobContext {
  id: string;
  ownerId: string;
  reportProgress(progress: number): void;
}

export type ApiJobHandler = (payload: unknown, context: ApiJobContext) => Promise<unknown> | unknown;

const memoryJobs = new Map<string, StoredApiJob>();
const handlers = new Map<string, ApiJobHandler>();
const maxMemoryJobs = 300;
const maxActiveJobsPerOwner = 25;
const maxPayloadBytes = 1024 * 1024;
const maxResultBytes = 8 * 1024 * 1024;
const retentionMs = 7 * 24 * 60 * 60 * 1000;
const leaseMs = 15 * 60 * 1000;
const workerId = `${process.pid}-${randomUUID()}`;
const activeJobs = new Set<Promise<void>>();
let pollingTimer: NodeJS.Timeout | undefined;
let polling = false;
let stopping = false;

function collection() {
  return atlasDatabase().collection<StoredApiJob>('api_jobs');
}

function safeError(error: unknown) {
  return {
    code: error instanceof AppError ? error.code : 'JOB_FAILED',
    message: error instanceof AppError ? error.message : 'The job failed unexpectedly.',
  };
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : 'UnknownError';
}

function asPublicJob(job: StoredApiJob): ApiJob {
  const { payload: _payload, payloadHash: _payloadHash, idempotencyKey: _idempotencyKey,
    createdAtDate: _createdAtDate, runAt: _runAt, leaseUntil: _leaseUntil, workerId: _workerId,
    expiresAt: _expiresAt, ...visible } = job;
  return visible;
}

function fromDocument(job: StoredApiJob | null) {
  return job ? asPublicJob(job) : null;
}

function payloadInfo(payload: unknown) {
  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    throw new AppError('Job payload must be JSON serializable.', 400, 'INVALID_JOB_PAYLOAD');
  }
  if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > maxPayloadBytes) {
    throw new AppError('Job payload exceeds the 1 MiB limit.', 413, 'JOB_PAYLOAD_TOO_LARGE');
  }
  return {
    payloadHash: createHash('sha256').update(serialized).digest('hex'),
    serialized,
  };
}

function evictMemoryJobs() {
  for (const [id, job] of memoryJobs) {
    if (memoryJobs.size < maxMemoryJobs) break;
    if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') memoryJobs.delete(id);
  }
  if (memoryJobs.size >= maxMemoryJobs) {
    throw new AppError('The job queue is full. Try again later.', 503, 'JOB_QUEUE_FULL');
  }
}

export function registerApiJobHandler(type: string, handler: ApiJobHandler) {
  handlers.set(type, handler);
}

function retryDelay(attempts: number) {
  return Math.min(60_000, 1_000 * (2 ** Math.max(0, attempts - 1)));
}

function canRetry(error: unknown) {
  return !(error instanceof AppError) || error.statusCode >= 500 || error.statusCode === 408 || error.statusCode === 429;
}

function executeMemoryJob(job: StoredApiJob) {
  const task = Promise.resolve().then(async () => {
    const handler = handlers.get(job.type);
    if (!handler) throw new AppError(`No worker is registered for ${job.type}.`, 500, 'JOB_HANDLER_MISSING');
    job.status = 'running';
    job.attempts += 1;
    job.progress = Math.max(1, job.progress);
    job.updatedAt = new Date().toISOString();
    try {
      const result = await handler(job.payload, {
        id: job.id,
        ownerId: job.ownerId,
        reportProgress(progress) {
          job.progress = Math.max(1, Math.min(99, Math.floor(progress)));
          job.updatedAt = new Date().toISOString();
        },
      });
      if (Buffer.byteLength(JSON.stringify(result) ?? '', 'utf8') > maxResultBytes) {
        throw new AppError('Job result exceeds the 8 MiB limit.', 413, 'JOB_RESULT_TOO_LARGE');
      }
      job.result = result;
      job.status = 'succeeded';
      job.progress = 100;
      job.updatedAt = new Date().toISOString();
      recordJobEvent(job.type, 'succeeded');
    } catch (error) {
      job.error = safeError(error);
      job.updatedAt = new Date().toISOString();
      if (canRetry(error) && job.attempts < job.maxAttempts) {
        job.status = 'queued';
        job.progress = 0;
        delete job.error;
        job.runAt = new Date(Date.now() + retryDelay(job.attempts));
        recordJobEvent(job.type, 'retry');
        setTimeout(() => {
          if (job.status === 'queued') executeMemoryJob(job);
        }, retryDelay(job.attempts)).unref();
      } else {
        job.status = 'failed';
        job.progress = 100;
        job.deadLetter = job.attempts >= job.maxAttempts;
        recordJobEvent(job.type, 'failed');
      }
    }
  }).finally(() => activeJobs.delete(task));
  activeJobs.add(task);
}

export async function enqueueApiJob(
  ownerId: string,
  type: string,
  payload: unknown,
  idempotencyKey?: string,
): Promise<ApiJob> {
  if (!handlers.has(type)) throw new AppError(`No worker is registered for ${type}.`, 500, 'JOB_HANDLER_MISSING');
  if (idempotencyKey !== undefined && !/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey)) {
    throw new AppError('Idempotency-Key must be 1-128 safe characters.', 400, 'INVALID_IDEMPOTENCY_KEY');
  }
  const { payloadHash } = payloadInfo(payload);
  const now = new Date();
  const job: StoredApiJob = {
    id: randomUUID(),
    ownerId,
    type,
    status: 'queued',
    progress: 0,
    attempts: 0,
    maxAttempts: 3,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    payload,
    payloadHash,
    createdAtDate: now,
    runAt: now,
    ...(idempotencyKey && { idempotencyKey }),
  };

  if (!atlasMode) {
    if (idempotencyKey) {
      const existing = [...memoryJobs.values()].find(item => item.ownerId === ownerId && item.idempotencyKey === idempotencyKey);
      if (existing) {
        if (existing.payloadHash !== payloadHash || existing.type !== type) {
          throw new AppError('Idempotency-Key was already used with a different request.', 409, 'IDEMPOTENCY_CONFLICT');
        }
        return asPublicJob(existing);
      }
    }
    const activeCount = [...memoryJobs.values()].filter(item => item.ownerId === ownerId
      && (item.status === 'queued' || item.status === 'running')).length;
    if (activeCount >= maxActiveJobsPerOwner) {
      throw new AppError('Too many active jobs. Try again later.', 429, 'JOB_RATE_LIMIT');
    }
    evictMemoryJobs();
    memoryJobs.set(job.id, job);
    recordJobEvent(type, 'enqueued');
    executeMemoryJob(job);
    return asPublicJob(job);
  }

  const jobs = collection();
  if (idempotencyKey) {
    const existing = await jobs.findOne({ ownerId, idempotencyKey });
    if (existing) {
      if (existing.payloadHash !== payloadHash || existing.type !== type) {
        throw new AppError('Idempotency-Key was already used with a different request.', 409, 'IDEMPOTENCY_CONFLICT');
      }
      return asPublicJob(existing);
    }
  }
  const activeCount = await jobs.countDocuments({ ownerId, status: { $in: ['queued', 'running'] } });
  if (activeCount >= maxActiveJobsPerOwner) {
    throw new AppError('Too many active jobs. Try again later.', 429, 'JOB_RATE_LIMIT');
  }
  try {
    await jobs.insertOne(job);
  } catch (error) {
    if (idempotencyKey && typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      const existing = await jobs.findOne({ ownerId, idempotencyKey });
      if (existing && existing.payloadHash === payloadHash && existing.type === type) return asPublicJob(existing);
      if (existing) throw new AppError('Idempotency-Key was already used with a different request.', 409, 'IDEMPOTENCY_CONFLICT');
    }
    throw error;
  }
  recordJobEvent(type, 'enqueued');
  return asPublicJob(job);
}

export async function getApiJob(id: string, ownerId: string): Promise<ApiJob | null> {
  if (!atlasMode) {
    const job = memoryJobs.get(id);
    return job?.ownerId === ownerId ? asPublicJob(job) : null;
  }
  return fromDocument(await collection().findOne({ id, ownerId }));
}

export async function listApiJobs(ownerId: string, type: string): Promise<Array<Omit<ApiJob, 'ownerId'>>> {
  if (!atlasMode) {
    return [...memoryJobs.values()]
      .filter(job => job.ownerId === ownerId && job.type === type)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50)
      .map(job => {
        const { ownerId: _ownerId, ...visible } = asPublicJob(job);
        return visible;
      });
  }
  const jobs = await collection().find({ ownerId, type }).sort({ createdAtDate: -1 }).limit(50).toArray();
  return jobs.map(job => {
    const { ownerId: _ownerId, ...visible } = asPublicJob(job);
    return visible;
  });
}

export async function getApiJobQueueStats() {
  const statuses: ApiJobStatus[] = ['queued', 'running', 'succeeded', 'failed', 'cancelled'];
  if (!atlasMode) {
    return Object.fromEntries(statuses.map(status => [
      status,
      [...memoryJobs.values()].filter(job => job.status === status).length,
    ])) as Record<ApiJobStatus, number>;
  }
  const counts = await Promise.all(statuses.map(status => collection().countDocuments({ status })));
  return Object.fromEntries(statuses.map((status, index) => [status, counts[index]])) as Record<ApiJobStatus, number>;
}

export async function cancelApiJob(id: string, ownerId: string): Promise<boolean | null> {
  if (!atlasMode) {
    const job = memoryJobs.get(id);
    if (!job || job.ownerId !== ownerId) return null;
    if (job.status !== 'queued') return false;
    job.status = 'cancelled';
    job.progress = 0;
    job.updatedAt = new Date().toISOString();
    return true;
  }
  const jobs = collection();
  const cancelled = await jobs.updateOne(
    { id, ownerId, status: 'queued' },
    { $set: { status: 'cancelled', progress: 0, updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + retentionMs) }, $unset: { payload: '' } },
  );
  if (cancelled.modifiedCount) return true;
  return await jobs.findOne({ id, ownerId }) ? false : null;
}

async function claimJob(): Promise<StoredApiJob | null> {
  const now = new Date();
  return collection().findOneAndUpdate(
    {
      attempts: { $lt: 3 },
      $or: [
        { status: 'queued', runAt: { $lte: now } },
        { status: 'running', leaseUntil: { $lte: now } },
      ],
    },
    {
      $set: { status: 'running', workerId, leaseUntil: new Date(now.getTime() + leaseMs),
        progress: 1, updatedAt: now.toISOString() },
      $inc: { attempts: 1 },
    },
    { sort: { runAt: 1, createdAtDate: 1 }, returnDocument: 'after', includeResultMetadata: false },
  );
}

async function failExhaustedJobs() {
  const now = new Date();
  await collection().updateMany(
    { status: 'running', attempts: { $gte: 3 }, leaseUntil: { $lte: now } },
    { $set: { status: 'failed', progress: 100, deadLetter: true, error: {
      code: 'JOB_ATTEMPTS_EXHAUSTED', message: 'The worker lease expired after the retry limit.',
    }, updatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + retentionMs) },
      $unset: { leaseUntil: '', workerId: '', payload: '' } },
  );
}

async function executePersistentJob(job: StoredApiJob) {
  const handler = handlers.get(job.type);
  const jobs = collection();
  const progress = (value: number) => {
    const at = new Date();
    void jobs.updateOne(
      { id: job.id, workerId, status: 'running' },
      { $set: { progress: Math.max(1, Math.min(99, Math.floor(value))),
        updatedAt: at.toISOString(), leaseUntil: new Date(at.getTime() + leaseMs) } },
    ).catch(error => console.error(JSON.stringify({
      event: 'job_progress_write_failed', jobId: job.id, errorName: errorName(error),
    })));
  };
  try {
    if (!handler) throw new AppError(`No worker is registered for ${job.type}.`, 500, 'JOB_HANDLER_MISSING');
    const result = await handler(job.payload, { id: job.id, ownerId: job.ownerId, reportProgress: progress });
    const serialized = JSON.stringify(result);
    if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > maxResultBytes) {
      throw new AppError('Job result exceeds the 8 MiB limit.', 413, 'JOB_RESULT_TOO_LARGE');
    }
    await jobs.updateOne(
      { id: job.id, workerId, status: 'running' },
      { $set: { status: 'succeeded', progress: 100, result, updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + retentionMs) },
        $unset: { workerId: '', leaseUntil: '', error: '', payload: '' } },
    );
    recordJobEvent(job.type, 'succeeded');
  } catch (error) {
    const retry = canRetry(error) && job.attempts < job.maxAttempts;
    const updatedAt = new Date();
    const failure = safeError(error);
    await jobs.updateOne(
      { id: job.id, workerId, status: 'running' },
      {
        $set: {
          status: retry ? 'queued' : 'failed',
          ...(retry ? { progress: 0, runAt: new Date(updatedAt.getTime() + retryDelay(job.attempts)) } : {
            progress: 100, deadLetter: job.attempts >= job.maxAttempts,
            expiresAt: new Date(updatedAt.getTime() + retentionMs),
          }),
          ...(retry ? {} : { error: failure }),
          updatedAt: updatedAt.toISOString(),
        },
        $unset: { workerId: '', leaseUntil: '', ...(retry ? { error: '' } : { payload: '' }) },
      },
    );
    recordJobEvent(job.type, retry ? 'retry' : 'failed');
  }
}

async function pollJobs() {
  if (polling || stopping || !atlasMode) return;
  polling = true;
  try {
    await failExhaustedJobs();
    while (!stopping && activeJobs.size < workerConcurrency()) {
      const job = await claimJob();
      if (!job) break;
      const task = executePersistentJob(job)
        .catch(error => console.error(JSON.stringify({
          event: 'job_execution_failed', jobId: job.id, errorName: errorName(error),
        })))
        .finally(() => activeJobs.delete(task));
      activeJobs.add(task);
    }
  } finally {
    polling = false;
  }
}

function workerConcurrency() {
  const raw = process.env.LAB_JOB_WORKER_CONCURRENCY;
  if (raw === undefined) return 1;
  const configured = Number(raw);
  if (!Number.isInteger(configured) || configured < 1 || configured > 8) {
    throw new Error('LAB_JOB_WORKER_CONCURRENCY must be an integer from 1 to 8.');
  }
  return configured;
}

export function startApiJobWorker() {
  if (!atlasMode || pollingTimer) return;
  workerConcurrency();
  stopping = false;
  pollingTimer = setInterval(() => {
    void pollJobs().catch(error => console.error(JSON.stringify({ event: 'job_queue_poll_failed', errorName: errorName(error) })));
  }, 500);
  pollingTimer.unref();
  void pollJobs().catch(error => console.error(JSON.stringify({ event: 'job_queue_poll_failed', errorName: errorName(error) })));
}

export async function stopApiJobWorker() {
  stopping = true;
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = undefined;
  while (polling || activeJobs.size) {
    await Promise.race([...activeJobs, new Promise(resolve => setTimeout(resolve, 100))]);
  }
}
