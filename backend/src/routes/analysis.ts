import { atlasDatabase, atlasMode } from '../database/atlas';
import { ObjectId } from 'mongodb';
import { readSavedAnalysisRuns } from '@dimension-lab/algorithms/savedRuns';
import { sendSuccess } from '../http/response';
import { AppError, BadRequestError, ForbiddenError } from '../http/errors';
import { AuthenticatedRequest } from '../auth/auth';
import type { Express } from 'express';
import { analyzeUnsupervised, computeAnalysis } from '../services/analysis';

export function registerAnalysisRoutes(app: Express) {
  // JSON strings preserve user-defined CSV column names verbatim in BSON.
  const history = () => {
    if (!atlasMode) throw new ForbiddenError('Account history requires Atlas storage.');
    return atlasDatabase().collection<{ _id: ObjectId; runs: string[] }>('unsupervised_history');
  };
  app.get('/api/unsupervised/history', async (req: AuthenticatedRequest, res, next) => {
    try {
      const record = await history().findOne({ _id: new ObjectId(req.user!.id) });
      sendSuccess(res, (record?.runs ?? []).map(run => JSON.parse(run) as unknown));
    } catch (error) { next(error); }
  });
  app.post('/api/unsupervised/history', async (req: AuthenticatedRequest, res, next) => {
    try {
      const collection = history();
      const [run] = readSavedAnalysisRuns([req.body]);
      if (!run) throw new BadRequestError('Invalid analysis run.');
      const serialized = JSON.stringify(run);
      // Five bounded runs fit in a single MongoDB document, so retention is atomic.
      if (Buffer.byteLength(serialized) > 3 * 1024 * 1024) {
        throw new AppError('This run exceeds the 3 MiB history limit. Export JSON to keep it.', 413, 'PAYLOAD_TOO_LARGE');
      }
      const record = await collection.findOneAndUpdate({ _id: new ObjectId(req.user!.id) },
        { $push: { runs: { $each: [serialized], $position: 0, $slice: 5 } } },
        { upsert: true, returnDocument: 'after' });
      sendSuccess(res, record!.runs.map(item => JSON.parse(item) as unknown), 201);
    } catch (error) { next(error); }
  });
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
