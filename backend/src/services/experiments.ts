import { atlasMode } from '../database/atlas';
import { BadRequestError, NotFoundError } from '../http/errors';
import { isJsonValue, isRecord } from '../http/validation';
import { ownsDataset } from '../repositories/atlasDatasets';
import { isSampleDataset, saveExperiment } from '../repositories/db';

export async function createExperiment(ownerId: string, body: unknown) {
  if (!isRecord(body)
    || typeof body.datasetId !== 'string'
    || typeof body.datasetName !== 'string'
    || typeof body.reductionMethod !== 'string'
    || typeof body.clusteringMethod !== 'string'
    || typeof body.k !== 'number'
    || !(typeof body.silhouetteScore === 'number' || body.silhouetteScore === null)
    || !(typeof body.ari === 'number' || body.ari === null)
    || (body.params !== undefined && !isJsonValue(body.params))) throw new BadRequestError('Invalid experiment data.');

  if (atlasMode && !isSampleDataset(body.datasetId) && !await ownsDataset(body.datasetId, ownerId)) {
    throw new NotFoundError('Dataset');
  }
  return saveExperiment({
    datasetId: body.datasetId, datasetName: body.datasetName,
    reductionMethod: body.reductionMethod, clusteringMethod: body.clusteringMethod,
    k: body.k, silhouetteScore: body.silhouetteScore, ari: body.ari,
    params: isRecord(body.params) && isJsonValue(body.params) ? body.params : {},
  }, ownerId);
}
