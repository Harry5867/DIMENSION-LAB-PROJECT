import { atlasMode, storageUnavailable } from '../database/atlas';
import { isMongoConnected, testDbConnection, clearComputeCache, getSystemHealth } from '../repositories/db';
import { sendError, sendSuccess } from '../http/response';
import { requireRole } from '../auth/auth';
import { getApiJobQueueStats } from '../services/apiJobs';
import { renderMetrics } from '../observability/metrics';
import type { Express } from 'express';

export function registerHealthRoutes(app: Express, basePath = '/api') {
  if (basePath === '/api') {
    app.get('/livez', (_req, res) => sendSuccess(res, { status: 'alive' }));
    app.get('/readyz', async (_req, res, next) => {
      try {
        const ready = !atlasMode || (await testDbConnection()).connected;
        if (!ready) return sendError(res, 503, 'NOT_READY', 'A required dependency is unavailable.');
        return sendSuccess(res, { status: 'ready' });
      } catch (error) {
        return next(error);
      }
    });
    app.get('/api/metrics', requireRole(['admin']), async (_req, res, next) => {
      try {
        res.type('text/plain; version=0.0.4; charset=utf-8').send(renderMetrics(await getApiJobQueueStats()));
      } catch (error) {
        next(error);
      }
    });
  }

  app.get(`${basePath}/health`, async (_req, res, next) => {
    if (atlasMode && !(await testDbConnection()).connected) return next(storageUnavailable());
    sendSuccess(res, {
      status: 'ok',
      database: isMongoConnected ? 'MongoDB Atlas (Cloud)' : 'In-Memory (Ready for MongoDB)',
    });
  });

  // 4. Enterprise System Health & RAM Monitoring
  app.get(`${basePath}/system-health`, async (_req, res, next) => {
    try {
      const health = await getSystemHealth();
      sendSuccess(res, health);
    } catch (err) {
      next(err);
    }
  });

  // 5. Force test connection to MongoDB
  app.post(`${basePath}/test-db`, requireRole(['admin']), async (_req, res, next) => {
    try {
      const result = await testDbConnection();
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  });

  // 6. Clear Compute Cache (Yêu cầu quyền Admin)
  app.delete(`${basePath}/cache`, requireRole(['admin']), async (_req, res, next) => {
    try {
      const cleared = await clearComputeCache();
      sendSuccess(res, {
        message: `Cleared ${cleared} cache entries.`,
        clearedCount: cleared,
      });
    } catch (err) {
      next(err);
    }
  });
}
