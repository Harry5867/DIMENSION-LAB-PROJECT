import type { ClusteringConfig, JsonValue, ReductionConfig } from '@dimension-lab/contracts';

const reductionKeys = ['method', 'normalization', 'perplexity', 'learningRate', 'iterations', 'nNeighbors', 'minDist'];
const clusteringKeys = ['method', 'k', 'epsilon', 'minPts', 'gmmIterations', 'gmmTolerance', 'seed'];

export function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every(key => allowed.includes(key));
}

export function isReductionConfig(value: unknown): value is ReductionConfig {
  if (!isRecord(value) || !hasOnlyKeys(value, reductionKeys)) return false;
  return (value.method === 'PCA' || value.method === 't-SNE' || value.method === 'UMAP')
    && (value.normalization === 'z-score' || value.normalization === 'min-max' || value.normalization === 'none')
    && typeof value.perplexity === 'number' && Number.isFinite(value.perplexity) && value.perplexity >= 1 && value.perplexity <= 50
    && typeof value.learningRate === 'number' && Number.isFinite(value.learningRate) && value.learningRate > 0 && value.learningRate <= 500
    && typeof value.iterations === 'number' && Number.isInteger(value.iterations) && value.iterations >= 1 && value.iterations <= 500
    && typeof value.nNeighbors === 'number' && Number.isInteger(value.nNeighbors) && value.nNeighbors >= 2 && value.nNeighbors <= 50
    && typeof value.minDist === 'number' && Number.isFinite(value.minDist) && value.minDist >= 0 && value.minDist <= 1;
}

export function isClusteringConfig(value: unknown): value is ClusteringConfig {
  if (!isRecord(value) || !hasOnlyKeys(value, clusteringKeys)) return false;
  return (value.method === 'K-Means' || value.method === 'DBSCAN' || value.method === 'GMM' || value.method === 'None')
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

export function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 64) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => isJsonValue(item, depth + 1));
  return isRecord(value) && Object.values(value).every(item => isJsonValue(item, depth + 1));
}
