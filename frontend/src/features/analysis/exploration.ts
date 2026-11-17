import { ClusteringConfig, DataPoint, EvaluationMetrics, ParsedDataset, ReductionConfig } from '@dimension-lab/contracts';
import { computeARI, computeSilhouetteScore } from '@dimension-lab/algorithms/metrics';
import { numericValue } from '@dimension-lab/algorithms/numericValue';

export interface AnalysisSnapshot {
  datasetId: string;
  features: string[];
  reduction: ReductionConfig;
  clustering: ClusteringConfig;
}

/** Include only effective reduction parameters when deciding whether an embedding is reusable. */
export function reductionKey(features: string[], config: ReductionConfig): string {
  return JSON.stringify([features, config.method, config.normalization,
    config.method === 't-SNE' ? [config.perplexity, config.learningRate, config.iterations]
      : config.method === 'UMAP' ? [config.nNeighbors, config.minDist] : null]);
}

export function clusteringKey(config: ClusteringConfig): string {
  return JSON.stringify([config.method, config.method === 'GMM' ? [config.k, config.gmmIterations ?? 100, config.gmmTolerance ?? 1e-5, config.seed ?? 42] : config.method === 'K-Means' ? config.k
    : config.method === 'DBSCAN' ? [config.epsilon, config.minPts] : null]);
}

export const normalizationLabels: Record<ReductionConfig['normalization'], string> = {
  none: 'None',
  'min-max': 'Min-Max',
  'z-score': 'Z-score',
};

export function describeRun(run: AnalysisSnapshot): string {
  const cluster = run.clustering.method === 'None' ? 'No clustering' : run.clustering.method;
  return [run.reduction.method, cluster, normalizationLabels[run.reduction.normalization]].join(' / ');
}

export function pendingAnalysisChanges(previous: AnalysisSnapshot, next: AnalysisSnapshot): string[] {
  const changes: string[] = [];
  const compare = (name: string, before: string | number, after: string | number) => {
    if (before !== after) changes.push(`${name}: ${before} → ${after}`);
  };
  if (JSON.stringify(previous.features) !== JSON.stringify(next.features)) {
    changes.push(previous.features.length === next.features.length
      ? 'Feature selection changed'
      : `Features: ${previous.features.length} → ${next.features.length}`);
  }
  const a = previous.reduction, b = next.reduction;
  compare('Normalization', normalizationLabels[a.normalization], normalizationLabels[b.normalization]);
  compare('Reduction', a.method, b.method);
  if (a.method === b.method && b.method === 't-SNE') {
    compare('Perplexity', a.perplexity, b.perplexity);
    compare('Learning rate', a.learningRate, b.learningRate);
    compare('Iterations', a.iterations, b.iterations);
  } else if (a.method === b.method && b.method === 'UMAP') {
    compare('Neighbors', a.nNeighbors, b.nNeighbors);
    compare('Min distance', a.minDist, b.minDist);
  }
  const c = previous.clustering, d = next.clustering;
  compare('Clustering', c.method, d.method);
  if (c.method === d.method && d.method === 'K-Means') compare('Clusters', c.k, d.k);
  if (c.method === d.method && d.method === 'GMM') { compare('Components', c.k, d.k); compare('Iterations', c.gmmIterations ?? 100, d.gmmIterations ?? 100); compare('Tolerance', c.gmmTolerance ?? 1e-5, d.gmmTolerance ?? 1e-5); compare('Seed', c.seed ?? 42, d.seed ?? 42); }
  if (c.method === d.method && d.method === 'DBSCAN') {
    compare('Radius (ε)', c.epsilon, d.epsilon);
    compare('Minimum points', c.minPts, d.minPts);
  }
  return changes;
}

export function makePoints(dataset: ParsedDataset, coordinates: [number, number, number][]): DataPoint[] {
  if (coordinates.length !== dataset.rawRows.length || coordinates.some(p => p.length !== 3 || p.some(v => !Number.isFinite(v)))) {
    throw new Error('The projection coordinates do not match the source data.');
  }
  return dataset.rawRows.map((row, index) => {
    const label = dataset.labelColumn ? row[dataset.labelColumn] : undefined;
    const [x, y, z] = coordinates[index]!;
    return {
      id: row[dataset.idColumn ?? ''] ?? index + 1,
      rowIndex: index,
      ...(label !== undefined && { label }),
      originalFeatures: Object.fromEntries(dataset.featureColumns.map(name => [name, numericValue(row[name])])),
      x, y, z, cluster: 0,
    };
  });
}

export function focusPoints(points: DataPoint[], cluster: number | null): DataPoint[] {
  return cluster === null ? points : points.filter(p => p.cluster === cluster);
}

/** Re-evaluate retained labels after a display edit; do not silently re-cluster. */
export function evaluatePointSet(points: DataPoint[], hasClusters: boolean, hasLabels: boolean): EvaluationMetrics {
  const counts: Record<number, number> = {};
  if (hasClusters) points.forEach(p => { if (p.cluster >= 0) counts[p.cluster] = (counts[p.cluster] ?? 0) + 1; });
  const finite = (value: number | null) => value !== null && Number.isFinite(value) ? value : null;
  return {
    clusterCounts: counts, noiseCount: hasClusters ? points.filter(p => p.cluster === -1).length : 0,
    outlierCount: points.filter(p => p.isOutlier || p.cluster === -1).length,
    silhouetteScore: hasClusters ? finite(computeSilhouetteScore(points.map(p => [p.x, p.y, p.z]), points.map(p => p.cluster))) : null,
    adjustedRandIndex: hasClusters && hasLabels ? finite(computeARI(points.map(p => p.label ?? null), points.map(p => p.cluster))) : null,
  };
}
