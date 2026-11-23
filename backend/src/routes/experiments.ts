import type { Express } from 'express';
import { requireRole, type AuthenticatedRequest } from '../auth/auth';
import { sendSuccess } from '../http/response';
import { getAllExperiments } from '../repositories/db';
import { createExperiment } from '../services/experiments';

export function registerExperimentRoutes(app: Express) {
  app.get('/api/experiments', async (req: AuthenticatedRequest, res, next) => {
    try {
      sendSuccess(res, await getAllExperiments(req.user!.id));
    } catch (error) { next(error); }
  });

  app.post('/api/experiments', requireRole(['admin', 'researcher']), async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = await createExperiment(req.user!.id, req.body);
      sendSuccess(res, { id, message: 'Experiment saved.' }, 201);
    } catch (error) { next(error); }
  });
}
