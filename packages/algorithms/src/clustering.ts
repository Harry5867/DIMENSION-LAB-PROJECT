import type { ClusteringConfig, DataPoint, EvaluationMetrics } from '@dimension-lab/contracts';
import { computeGMM } from './gmm';
import { computeKMeans } from './kmeans';
import { computeDBSCAN } from './dbscan';
import { detectKMeansOutliers, detectOutliers3D, summarizeClustering } from './metrics';

/** Cluster and evaluate the same points in the same coordinate space. Never mutate source rows. */
export function clusterPoints(points: DataPoint[], config: ClusteringConfig, hasLabels: boolean) {
  const coordinates = points.map(p => [p.x, p.y, p.z]);
  let labels: number[] = [];
  let outliers: boolean[];
  let gmm: ReturnType<typeof computeGMM> | undefined;
  if (config.method === 'K-Means') {
    const result = computeKMeans(coordinates, config.k);
    labels = result.clusters;
    outliers = detectKMeansOutliers(points, labels, result.centroids);
  } else if (config.method === 'GMM') {
    gmm = computeGMM(coordinates, { k: config.k, maxIterations: config.gmmIterations, tolerance: config.gmmTolerance, seed: config.seed });
    labels = gmm.clusters; outliers = detectOutliers3D(points);
  } else if (config.method === 'DBSCAN') {
    labels = computeDBSCAN(coordinates, config.epsilon, config.minPts).clusters;
    outliers = labels.map(label => label === -1);
  } else outliers = detectOutliers3D(points);
  const updated = points.map((p, i) => ({ ...p, cluster: labels[i] ?? 0, isOutlier: outliers[i], clusterConfidence: gmm ? Math.max(...gmm.probabilities[i]) : undefined }));
  const groundTruth = hasLabels && labels.length > 0 ? points.map(p => p.label ?? null) : undefined;
  const metrics: EvaluationMetrics = {
    ...summarizeClustering(coordinates, labels, groundTruth),
    outlierCount: outliers.filter(Boolean).length,
  };
  return { points: updated, metrics, gmm };
}
