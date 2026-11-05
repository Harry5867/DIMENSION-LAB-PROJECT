import { ExperimentRecord } from '../types';
import { AnalysisSnapshot } from './exploration';
import { isRecord } from './typeGuards';

export function experimentConfiguration(record: ExperimentRecord): AnalysisSnapshot | null {
  if (!isRecord(record.params)) return null;
  const { reduction: r, clustering: c, features } = record.params;
  if (!isRecord(r) || !isRecord(c) || !Array.isArray(features) || features.length < 3 || !features.every(f => typeof f === 'string')) return null;
  if (!['PCA', 't-SNE', 'UMAP'].includes(String(r.method)) || !['z-score', 'min-max', 'none'].includes(String(r.normalization))
    || !['K-Means', 'DBSCAN', 'None'].includes(String(c.method))) return null;
  const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (![r.perplexity, r.learningRate, r.iterations, r.nNeighbors, c.k, c.epsilon, c.minPts].every(positive)
    || typeof r.minDist !== 'number' || !Number.isFinite(r.minDist) || r.minDist < 0 || r.minDist > 1
    || !Number.isInteger(c.k) || !Number.isInteger(c.minPts) || !Number.isInteger(r.iterations) || !Number.isInteger(r.nNeighbors)) return null;
  return { datasetId: record.dataset_id, features: [...features] as string[],
    reduction: { method: r.method, normalization: r.normalization, perplexity: r.perplexity, learningRate: r.learningRate,
      iterations: r.iterations, nNeighbors: r.nNeighbors, minDist: r.minDist },
    clustering: { method: c.method, k: c.k, epsilon: c.epsilon, minPts: c.minPts } } as AnalysisSnapshot;
}
