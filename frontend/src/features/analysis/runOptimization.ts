import type { ClusteringConfig, ReductionConfig } from '@dimension-lab/contracts';
import { fetchWithTimeout } from '../../shared/api/network';
import { isRecord } from '../../shared/api/typeGuards';
import type { AnalysisSnapshot } from './exploration';

export interface OptimizationResult {
  reduction: ReductionConfig;
  clustering: ClusteringConfig;
  score: number;
  candidatesEvaluated: number;
}

function isReductionConfig(value: unknown): value is ReductionConfig {
  return isRecord(value)
    && (value.method === 'PCA' || value.method === 't-SNE' || value.method === 'UMAP')
    && (value.normalization === 'none' || value.normalization === 'min-max' || value.normalization === 'z-score')
    && typeof value.perplexity === 'number' && Number.isFinite(value.perplexity) && value.perplexity >= 1 && value.perplexity <= 50
    && typeof value.learningRate === 'number' && Number.isFinite(value.learningRate) && value.learningRate > 0 && value.learningRate <= 500
    && typeof value.iterations === 'number' && Number.isInteger(value.iterations) && value.iterations >= 1 && value.iterations <= 500
    && typeof value.nNeighbors === 'number' && Number.isInteger(value.nNeighbors) && value.nNeighbors >= 2 && value.nNeighbors <= 50
    && typeof value.minDist === 'number' && Number.isFinite(value.minDist) && value.minDist >= 0 && value.minDist <= 1;
}

function isClusteringConfig(value: unknown): value is ClusteringConfig {
  return isRecord(value)
    && (value.method === 'K-Means' || value.method === 'GMM' || value.method === 'DBSCAN' || value.method === 'None')
    && typeof value.k === 'number' && Number.isInteger(value.k) && value.k >= 1
    && typeof value.epsilon === 'number' && Number.isFinite(value.epsilon) && value.epsilon > 0
    && typeof value.minPts === 'number' && Number.isInteger(value.minPts) && value.minPts >= 1
    && (value.gmmIterations === undefined || (typeof value.gmmIterations === 'number'
      && Number.isInteger(value.gmmIterations) && value.gmmIterations >= 1 && value.gmmIterations <= 500))
    && (value.gmmTolerance === undefined || (typeof value.gmmTolerance === 'number'
      && Number.isFinite(value.gmmTolerance) && value.gmmTolerance > 0 && value.gmmTolerance <= 1))
    && (value.seed === undefined || (typeof value.seed === 'number'
      && Number.isInteger(value.seed) && value.seed >= 0 && value.seed <= 0xffffffff));
}

async function responseData(response: Response, action: string) {
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
      ? body.error.message : `${action} failed (HTTP ${response.status}).`;
    throw new Error(error);
  }
  if (!isRecord(body) || !isRecord(body.data)) throw new Error(`The server returned an invalid ${action.toLowerCase()} response.`);
  return body.data;
}

export async function optimizeAnalysis(snapshot: AnalysisSnapshot, rowCount: number): Promise<OptimizationResult> {
  if (rowCount > 200) throw new RangeError('Automatic tuning supports at most 200 rows.');
  const accepted = await responseData(await fetchWithTimeout('/api/v2/analyses/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      datasetId: snapshot.datasetId,
      features: snapshot.features,
      reduction: snapshot.reduction,
      clustering: snapshot.clustering,
    }),
  }, 15_000), 'Start parameter optimization');
  if (typeof accepted.id !== 'string') throw new Error('The server did not return an optimization job ID.');

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const job = await responseData(await fetchWithTimeout('/api/v2/jobs/' + encodeURIComponent(accepted.id), {}, 10_000), 'Read optimization job');
    if (job.status === 'failed') {
      const message = isRecord(job.error) && typeof job.error.message === 'string' ? job.error.message : 'Parameter optimization failed.';
      throw new Error(message);
    }
    if (job.status === 'cancelled') throw new Error('Parameter optimization was cancelled.');
    if (job.status === 'succeeded') {
      if (!isRecord(job.result) || !isRecord(job.result.best)
        || !isReductionConfig(job.result.best.reductionConfig)
        || !isClusteringConfig(job.result.best.clusteringConfig)
        || typeof job.result.best.score !== 'number' || !Number.isFinite(job.result.best.score)
        || typeof job.result.candidatesEvaluated !== 'number') {
        throw new Error('The server returned invalid optimized analysis settings.');
      }
      return {
        reduction: job.result.best.reductionConfig,
        clustering: job.result.best.clusteringConfig,
        score: job.result.best.score,
        candidatesEvaluated: job.result.candidatesEvaluated,
      };
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Parameter optimization timed out.');
}
