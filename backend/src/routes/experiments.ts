import { atlasMode } from '../database/atlas';
import { ownsDataset } from '../repositories/atlasDatasets';
import { isSampleDataset, getAllExperiments, saveExperiment } from '../repositories/db';
import { sendSuccess } from '../http/response';
import { BadRequestError, NotFoundError } from '../http/errors';
import { requireRole, AuthenticatedRequest } from '../auth/auth';
import type { Express } from 'express';
import { isJsonValue, isRecord } from '../http/validation';

export function registerExperimentRoutes(app: Express, basePath = '/api') {
  // 13. Experiments History in MongoDB
  app.get(`${basePath}/experiments`, async (req: AuthenticatedRequest, res, next) => {
    try {
      const list = await getAllExperiments(req.user!.id);
      sendSuccess(res, list);
    } catch (err) {
      next(err);
    }
  });

  app.post(`${basePath}/experiments`, requireRole(['admin', 'researcher']), async (req: AuthenticatedRequest, res, next) => {
    try {
      const body: unknown = req.body;
      if (!isRecord(body)
        || typeof body.datasetId !== 'string'
        || typeof body.datasetName !== 'string'
        || typeof body.reductionMethod !== 'string'
        || typeof body.clusteringMethod !== 'string'
        || typeof body.k !== 'number'
        || !(typeof body.silhouetteScore === 'number' || body.silhouetteScore === null)
        || !(typeof body.ari === 'number' || body.ari === null)
        || (body.params !== undefined && !isJsonValue(body.params))) {
        throw new BadRequestError('Invalid experiment data.');
      }

      if (atlasMode && !isSampleDataset(body.datasetId) && !await ownsDataset(body.datasetId, req.user!.id)) {
        throw new NotFoundError('Dataset');
      }
      const id = await saveExperiment({
        datasetId: body.datasetId,
        datasetName: body.datasetName,
        reductionMethod: body.reductionMethod,
        clusteringMethod: body.clusteringMethod,
        k: body.k,
        silhouetteScore: body.silhouetteScore,
        ari: body.ari,
        params: isRecord(body.params) && isJsonValue(body.params) ? body.params : {},
      }, req.user!.id);

      sendSuccess(res, { id, message: 'Experiment saved.' }, 201);
    } catch (err) {
      next(err);
    }
  });
}
