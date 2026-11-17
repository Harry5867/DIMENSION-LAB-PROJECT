import { ClusteringConfig, JsonValue, ReductionConfig } from '@dimension-lab/contracts';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isReductionConfig(value: unknown): value is ReductionConfig {
  if (!isRecord(value)) return false;
  return (value.method === 'PCA' || value.method === 't-SNE' || value.method === 'UMAP')
    && (value.normalization === 'z-score' || value.normalization === 'min-max' || value.normalization === 'none')
    && typeof value.perplexity === 'number'
    && typeof value.learningRate === 'number'
    && typeof value.iterations === 'number'
    && typeof value.nNeighbors === 'number'
    && typeof value.minDist === 'number';
}

export function isClusteringConfig(value: unknown): value is ClusteringConfig {
  if (!isRecord(value)) return false;
  return (value.method === 'K-Means' || value.method === 'DBSCAN' || value.method === 'GMM' || value.method === 'None')
    && typeof value.k === 'number'
    && typeof value.epsilon === 'number'
    && typeof value.minPts === 'number';
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}
