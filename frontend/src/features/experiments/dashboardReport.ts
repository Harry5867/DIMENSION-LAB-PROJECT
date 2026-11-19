import type { DataPoint, DataValue, EvaluationMetrics, ParsedDataset } from '@dimension-lab/contracts';
import type { GMMResult } from '@dimension-lab/algorithms/gmm';
import { normalizationLabels, type AnalysisSnapshot } from '../analysis/exploration';

export interface DashboardInput {
  dataset: ParsedDataset;
  points: DataPoint[];
  run: AnalysisSnapshot;
  metrics: EvaluationMetrics;
  gmm?: Pick<GMMResult, 'aic' | 'bic' | 'logLikelihood' | 'converged'>;
}

export function createDashboardReport({ dataset, points, run, metrics, gmm }: DashboardInput, includeSource = false) {
  const reduction = run.reduction;
  const clustering = run.clustering;
  const hasClusters = clustering.method !== 'None';
  const parameters: [string, string | number][] = [
    ['Normalization', normalizationLabels[reduction.normalization]],
    ['Reduction', reduction.method],
    ['Clustering', hasClusters ? clustering.method : 'None'],
  ];
  if (reduction.method === 't-SNE') {
    parameters.push(['Perplexity', reduction.perplexity], ['Learning rate', reduction.learningRate], ['Iterations', reduction.iterations]);
  } else if (reduction.method === 'UMAP') {
    parameters.push(['Neighbors', reduction.nNeighbors], ['Minimum distance', reduction.minDist]);
  }
  if (clustering.method === 'K-Means') parameters.push(['Requested clusters', clustering.k]);
  if (clustering.method === 'DBSCAN') parameters.push(['Radius (ε)', clustering.epsilon], ['Minimum points', clustering.minPts]);
  if (clustering.method === 'GMM') {
    parameters.push(['Components', clustering.k], ['Max EM iterations', clustering.gmmIterations ?? 100],
      ['Tolerance', clustering.gmmTolerance ?? 1e-5], ['Random seed', clustering.seed ?? 42]);
  }

  const hasLabels = points.some(point => point.label != null && point.label !== '');
  const rows = points.map(point => ({
    id: point.id,
    sourceRow: point.rowIndex === undefined ? null : point.rowIndex + 1,
    x: point.x, y: point.y, z: point.z,
    cluster: hasClusters ? point.cluster : null,
    ...(hasLabels && { label: point.label ?? null }),
    ...(clustering.method === 'GMM' && { confidence: point.clusterConfidence ?? null }),
  }));
  const counts = new Map<number, number>();
  for (const point of rows) {
    if (point.cluster !== null) counts.set(point.cluster, (counts.get(point.cluster) ?? 0) + 1);
  }
  const groups = [...counts].sort(([a], [b]) => (a === -1 ? Infinity : a) - (b === -1 ? Infinity : b))
    .map(([id, count]) => ({ id, count }));

  const source = includeSource ? {
    columns: dataset.headers,
    values: points.map(point => {
      const row = point.rowIndex === undefined ? undefined : dataset.rawRows[point.rowIndex];
      return dataset.headers.map((header): DataValue => row?.[header] ?? null);
    }),
  } : undefined;
  return {
    dataset: { name: dataset.name, sourceRows: dataset.totalRows },
    reduction: reduction.method, clustering: clustering.method, parameters, features: run.features,
    hasClusters, hasLabels, rows, groups,
    metrics: {
      silhouette: hasClusters ? metrics.silhouetteScore : null,
      ari: hasClusters && hasLabels ? metrics.adjustedRandIndex : null,
      variance: reduction.method === 'PCA' ? metrics.explainedVariance : undefined,
      executionTimeMs: metrics.executionTimeMs,
      ...(clustering.method === 'GMM' && gmm && { gmm: {
        aic: gmm.aic, bic: gmm.bic, logLikelihood: gmm.logLikelihood, converged: gmm.converged,
      } }),
    },
    ...(source && { source }),
  };
}

export function serializeDashboardReport(report: ReturnType<typeof createDashboardReport>) {
  // This JSON is placed inside a script data block. Escaping '<' prevents closing the tag.
  return JSON.stringify(report).replace(/[<>&\u2028\u2029]/g, character =>
    '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
}
