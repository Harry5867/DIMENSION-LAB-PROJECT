import type { ComputeResult, ReductionConfig } from '@dimension-lab/contracts';
import { computePCA } from './pca';
import { computeTSNE } from './tsne';
import { computeUMAP } from './umap';

export type ProjectionResult = Pick<ComputeResult, 'coordinates' | 'components' | 'explainedVariance' | 'totalExplainedVariance'>;

export function reduceMatrix(matrix: number[][], config: ReductionConfig): ProjectionResult {
  if (config.method === 'PCA') return computePCA(matrix);
  return { coordinates: config.method === 't-SNE' ? computeTSNE(matrix, config) : computeUMAP(matrix, config) };
}

export function projectionSettingsError(config: ReductionConfig, rows: number): string | null {
  if (config.method !== 'PCA' && rows > 1000) {
    return `${config.method} supports up to 1,000 rows. Choose PCA for a larger dataset.`;
  }
  if (config.method === 't-SNE' && (!Number.isFinite(config.perplexity) || config.perplexity < 1 || config.perplexity > 50
    || !Number.isFinite(config.learningRate) || config.learningRate <= 0 || config.learningRate > 500
    || !Number.isInteger(config.iterations) || config.iterations < 1 || config.iterations > 500)) {
    return 'Invalid t-SNE perplexity, learning rate, or iteration count.';
  }
  if (config.method === 'UMAP' && (!Number.isInteger(config.nNeighbors) || config.nNeighbors < 2 || config.nNeighbors > 50
    || !Number.isFinite(config.minDist) || config.minDist < 0 || config.minDist > 1)) {
    return 'Invalid UMAP neighbor count or minimum distance.';
  }
  return null;
}
