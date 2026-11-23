import { atlasMode } from '../database/atlas';
import { sendSuccess } from '../http/response';
import { AppError, BadRequestError } from '../http/errors';
import { AuthenticatedRequest } from '../auth/auth';
import express, { type Express } from 'express';
import { readRequestBody } from '../http/body';
import { analyzeUnsupervised, computeAnalysis } from '../services/analysis';
import { readAnalysisHistory, saveAnalysisHistory } from '../services/analysisHistory';
import { analysisWorkload } from '../middleware/workloadLimits';

const parseAnalysisBody = express.json({ limit: '32mb' });

export function registerAnalysisRoutes(app: Express) {
  app.get('/api/unsupervised/history', async (req: AuthenticatedRequest, res, next) => {
    try {
      sendSuccess(res, await readAnalysisHistory(req.user!.id));
    } catch (error) { next(error); }
  });
  app.post('/api/unsupervised/history', async (req: AuthenticatedRequest, res, next) => {
    try {
      sendSuccess(res, await saveAnalysisHistory(req.user!.id, req.body), 201);
    } catch (error) { next(error); }
  });
  app.post('/api/unsupervised', async (req, res, next) => {
    try {
      const data = await analysisWorkload.run(async () => {
        await readRequestBody(parseAnalysisBody, req, res);
        try { return analyzeUnsupervised(req.body); }
        catch (error) {
          throw error instanceof AppError ? error : new BadRequestError(error instanceof Error ? error.message : 'Invalid unsupervised task.');
        }
      });
      sendSuccess(res, data);
    } catch (error) { if (!res.destroyed) next(error); }
  });

  // 12. High-Performance Compute API with SHA-256 Multi-Tier Caching
  app.post('/api/compute', async (req: AuthenticatedRequest, res, next) => {
    try {
      const { cache, cacheKey, result } = await analysisWorkload.run(async () => {
        await readRequestBody(parseAnalysisBody, req, res);
        return computeAnalysis(req.body, atlasMode ? req.user!.id : undefined);
      });
      res.setHeader('X-Cache', cache);
      res.setHeader('X-Cache-Key', cacheKey);
      sendSuccess(res, result);
    } catch (error) {
      if (!res.destroyed) next(error);
    }
  });
}
