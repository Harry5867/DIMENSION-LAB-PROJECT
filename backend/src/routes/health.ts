import { atlasMode, storageUnavailable } from '../database/atlas';
import { isMongoConnected, testDbConnection, clearComputeCache, getSystemHealth } from '../repositories/db';
import { sendSuccess } from '../http/response';
import { requireRole } from '../auth/auth';
import type { Express } from 'express';

export function registerHealthRoutes(app: Express) {
  app.get('/api/health', async (_req, res, next) => {
    if (atlasMode && !(await testDbConnection()).connected) return next(storageUnavailable());
    sendSuccess(res, {
      status: 'ok',
      database: isMongoConnected ? 'MongoDB Atlas (Cloud)' : 'In-Memory (Ready for MongoDB)',
    });
  });

  // 4. Enterprise System Health & RAM Monitoring
  app.get('/api/system-health', requireRole(['admin']), async (_req, res, next) => {
    try {
      const health = await getSystemHealth();
      sendSuccess(res, health);
    } catch (err) {
      next(err);
    }
  });

  // 5. Force test connection to MongoDB
  app.post('/api/test-db', requireRole(['admin']), async (_req, res, next) => {
    try {
      const result = await testDbConnection();
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  });

  // 6. Clear Compute Cache (Yêu cầu quyền Admin)
  app.delete('/api/cache', requireRole(['admin']), async (_req, res, next) => {
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
