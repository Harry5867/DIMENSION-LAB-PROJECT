import { atlasMode } from '../database/atlas';
import { sendSuccess } from '../http/response';
import { BadRequestError } from '../http/errors';
import { AuthenticatedRequest } from '../auth/auth';
import type { Express } from 'express';
import { analyzeUnsupervised, computeAnalysis } from '../services/analysis';

export function registerAnalysisRoutes(app: Express) {
  app.post('/api/unsupervised', (req, res, next) => {
    try {
      sendSuccess(res, analyzeUnsupervised(req.body));
    } catch (error) { next(new BadRequestError(error instanceof Error ? error.message : 'Invalid unsupervised task.')); }
  });

  // 12. High-Performance Compute API with SHA-256 Multi-Tier Caching
  app.post('/api/compute', async (req: AuthenticatedRequest, res, next) => {
    try {
      const { cache, cacheKey, result } = await computeAnalysis(req.body, atlasMode ? req.user!.id : undefined);
      res.setHeader('X-Cache', cache);
      res.setHeader('X-Cache-Key', cacheKey);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  });
}
