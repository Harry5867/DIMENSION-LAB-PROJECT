import type { Express } from 'express';
import type { AuthenticatedRequest } from '../auth/auth';
import { integerSetting } from '../config/limits';
import { AppError } from '../http/errors';

const minute = 60_000;

function workload(rate: number, maxInFlight: number) {
  const accounts = new Map<string, number>();
  let windowEnd = 0;
  let inFlight = 0;
  const enabled = process.env.NODE_ENV === 'production' || process.env.LAB_LIMITS_ENABLED === '1';

  return {
    install(app: Express, paths: string | string[]) {
      if (!enabled) return;
      app.post(paths, (req: AuthenticatedRequest, res, next) => {
        const now = Date.now();
        if (now >= windowEnd) {
          accounts.clear();
          windowEnd = now + minute;
        }
        const owner = req.user!.id;
        const used = accounts.get(owner) ?? 0;
        if (used >= rate || (!accounts.has(owner) && accounts.size >= 4096)) {
          res.setHeader('Retry-After', String(Math.ceil((windowEnd - now) / 1000)));
          return next(new AppError('Too many requests. Try again shortly.', 429, 'RATE_LIMITED'));
        }
        if (inFlight >= maxInFlight) {
          res.setHeader('Retry-After', '2');
          return next(new AppError('The service is busy. Try again shortly.', 429, 'WORKLOAD_BUSY'));
        }
        accounts.set(owner, used + 1);
        next();
      });
    },
    async run<T>(task: () => T | Promise<T>): Promise<T> {
      if (!enabled) return task();
      if (inFlight >= maxInFlight) throw new AppError('The service is busy. Try again shortly.', 429, 'WORKLOAD_BUSY');
      inFlight++;
      try {
        return await task();
      } finally { inFlight--; }
    },
  };
}

export const uploadWorkload = workload(integerSetting('LAB_UPLOADS_PER_MINUTE', 30), integerSetting('LAB_UPLOAD_CONCURRENCY', 2));
export const analysisWorkload = workload(integerSetting('LAB_ANALYSES_PER_MINUTE', 30), integerSetting('LAB_ANALYSIS_CONCURRENCY', 2));

export function installWorkloadLimits(app: Express) {
  uploadWorkload.install(app, '/api/datasets/upload');
  analysisWorkload.install(app, ['/api/compute', '/api/unsupervised']);
}
