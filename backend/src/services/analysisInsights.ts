import { computeDBSCAN } from '@dimension-lab/algorithms/dbscan';
import { computeGMM } from '@dimension-lab/algorithms/gmm';
import { computeKMeans } from '@dimension-lab/algorithms/kmeans';
import { summarizeClustering } from '@dimension-lab/algorithms/metrics';
import { reduceMatrix } from '@dimension-lab/algorithms/projection';
import type { ClusteringConfig, ReductionConfig } from '@dimension-lab/contracts';

const OUTLIER_ROBUST_Z_THRESHOLD = 3.5;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function pointDiagnostics(matrix: number[][], assignments: number[]) {
  const featureStats = matrix[0].map((_, column) => {
    const values = matrix.map(row => row[column]);
    const center = median(values);
    const mad = median(values.map(value => Math.abs(value - center)));
    return { center, mad };
  });
  const robustOutlierScores = matrix.map(row => featureStats.reduce((score, stat, column) => {
    if (stat.mad === 0) return score;
    return Math.max(score, Math.abs(0.6745 * (row[column] - stat.center) / stat.mad));
  }, 0));
  const outlierFlags = robustOutlierScores.map(score => score > OUTLIER_ROBUST_Z_THRESHOLD);
  const noiseFlags = matrix.map((_, index) => assignments[index] === -1);
  const outlierCount = outlierFlags.filter(Boolean).length;
  const noiseCount = noiseFlags.filter(Boolean).length;
  return {
    robustOutlierScores,
    outlierFlags,
    noiseFlags,
    summary: {
      method: 'maximum absolute modified z-score using median and MAD',
      robustZThreshold: OUTLIER_ROBUST_Z_THRESHOLD,
      outlierCount,
      outlierRate: matrix.length ? outlierCount / matrix.length : 0,
      noiseCount,
      noiseRate: matrix.length ? noiseCount / matrix.length : 0,
      overlappingOutlierAndNoiseCount: outlierFlags.filter((flag, index) => flag && noiseFlags[index]).length,
      note: 'Outlier flags are review signals; they do not remove or alter source rows.',
    },
  };
}

function neighborRanks(matrix: number[][], neighbors: number) {
  const n = matrix.length;
  const ranks = new Uint32Array(n * n);
  for (let row = 0; row < n; row++) {
    const ordered = matrix.map((point, index) => ({
      index,
      distance: index === row ? Infinity : Math.hypot(...point.map((value, column) => value - matrix[row][column])),
    })).sort((a, b) => a.distance - b.distance || a.index - b.index);
    ordered.forEach((neighbor, rank) => { ranks[row * n + neighbor.index] = rank + 1; });
  }
  return { ranks, neighbors };
}

export function computeTrustworthiness(original: number[][], embedding: number[][], requestedNeighbors = 10): number | null {
  const n = original.length;
  if (embedding.length !== n || n < 3 || original.some(row => row.length !== original[0].length)
    || embedding.some(row => row.length !== embedding[0].length)) return null;
  const k = Math.min(requestedNeighbors, Math.floor((n - 1) / 2));
  if (k < 1) return null;
  const originalRanks = neighborRanks(original, k).ranks;
  const embeddedRanks = neighborRanks(embedding, k).ranks;
  let penalty = 0;
  for (let row = 0; row < n; row++) {
    for (let column = 0; column < n; column++) {
      if (embeddedRanks[row * n + column] <= k) {
        const sourceRank = originalRanks[row * n + column];
        if (sourceRank > k) penalty += sourceRank - k;
      }
    }
  }
  return Math.max(-1, Math.min(1, 1 - (2 * penalty) / (n * k * (2 * n - 3 * k - 1))));
}

function daviesBouldinIndex(points: number[][], assignments: number[]) {
  const groups = new Map<number, number[][]>();
  assignments.forEach((label, index) => {
    if (label < 0) return;
    const group = groups.get(label) ?? [];
    group.push(points[index]);
    groups.set(label, group);
  });
  const clusters = [...groups.values()];
  if (clusters.length < 2) return null;
  const centroids = clusters.map(rows => rows[0].map((_, column) =>
    rows.reduce((sum, row) => sum + row[column], 0) / rows.length));
  const scatter = clusters.map((rows, index) => rows.reduce((sum, row) =>
    sum + Math.hypot(...row.map((value, column) => value - centroids[index][column])), 0) / rows.length);
  const ratios = clusters.map((_, index) => {
    let worst = 0;
    for (let other = 0; other < clusters.length; other++) {
      if (other === index) continue;
      const separation = Math.hypot(...centroids[index].map((value, column) => value - centroids[other][column]));
      if (separation === 0) return Infinity;
      worst = Math.max(worst, (scatter[index] + scatter[other]) / separation);
    }
    return worst;
  });
  const result = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
  return Number.isFinite(result) ? result : null;
}

export function evaluateAnalysisQuality(original: number[][], coordinates: number[][], assignments: number[]) {
  const clustering = summarizeClustering(coordinates, assignments);
  const clusterSizes = Object.values(clustering.clusterCounts);
  const clusteredCount = clusterSizes.reduce((sum, count) => sum + count, 0);
  return {
    dimensionalityReduction: {
      trustworthiness: computeTrustworthiness(original, coordinates),
      neighborCount: Math.min(10, Math.floor((original.length - 1) / 2)),
      explainedVariance: undefined,
      interpretation: 'Trustworthiness measures preservation of local neighborhoods; higher values indicate fewer false neighbors.',
    },
    clustering: {
      silhouetteScore: clustering.silhouetteScore,
      daviesBouldinIndex: daviesBouldinIndex(coordinates, assignments),
      clusterCount: clusterSizes.length,
      clusterCounts: clustering.clusterCounts,
      clusteredCount,
      noiseCount: clustering.noiseCount,
      noiseRate: assignments.length ? clustering.noiseCount / assignments.length : 0,
      smallestClusterSize: clusterSizes.length ? Math.min(...clusterSizes) : 0,
      largestClusterSize: clusterSizes.length ? Math.max(...clusterSizes) : 0,
      note: 'Silhouette is higher-is-better; Davies-Bouldin is lower-is-better. Noise is excluded from both scores.',
    },
  };
}

function clusteringCandidates(config: ClusteringConfig, rowCount: number): ClusteringConfig[] {
  if (config.method === 'DBSCAN') {
    return [0.75, 1, 1.5].map(multiplier => ({ ...config, epsilon: config.epsilon * multiplier }));
  }
  if (config.method === 'K-Means' || config.method === 'GMM') {
    const max = config.method === 'GMM' ? Math.min(rowCount, 100) : rowCount;
    return [...new Set([2, config.k, 4].filter(k => k <= max))]
      .map(k => ({ ...config, k }));
  }
  return [config];
}

function reductionCandidates(config: ReductionConfig, rowCount: number): ReductionConfig[] {
  if (config.method === 't-SNE') {
    const maxPerplexity = Math.min(50, Math.floor((rowCount - 1) / 3));
    return [...new Set([5, config.perplexity, 30].map(value => Math.max(1, Math.min(maxPerplexity, value))))]
      .map(perplexity => ({ ...config, perplexity }));
  }
  if (config.method === 'UMAP') {
    const maxNeighbors = Math.min(50, rowCount - 1);
    return [...new Set([5, config.nNeighbors, 30].map(value => Math.max(2, Math.min(maxNeighbors, value))))]
      .map(nNeighbors => ({ ...config, nNeighbors }));
  }
  return [config];
}

function cluster(matrix: number[][], config: ClusteringConfig) {
  if (config.method === 'K-Means') return computeKMeans(matrix, config.k).clusters;
  if (config.method === 'GMM') return computeGMM(matrix, {
    k: config.k,
    maxIterations: config.gmmIterations ?? 100,
    tolerance: config.gmmTolerance ?? 1e-5,
    seed: config.seed ?? 42,
  }).clusters;
  if (config.method === 'DBSCAN') return computeDBSCAN(matrix, config.epsilon, config.minPts).clusters;
  return [];
}

export function optimizeAnalysisParameters(
  matrix: number[][],
  reduction: ReductionConfig,
  clustering: ClusteringConfig,
  reportProgress: (progress: number) => void,
) {
  if (matrix.length > 200) throw new RangeError('Automatic tuning is limited to 200 rows per run.');
  const reductions = reductionCandidates(reduction, matrix.length);
  const clusterings = clusteringCandidates(clustering, matrix.length);
  const candidates = reductions.flatMap(reductionConfig =>
    clusterings.map(clusteringConfig => ({ reductionConfig, clusteringConfig }))).slice(0, 9);
  const results = candidates.map(candidate => {
    const projection = reduceMatrix(matrix, candidate.reductionConfig);
    const assignments = cluster(projection.coordinates, candidate.clusteringConfig);
    const metrics = summarizeClustering(projection.coordinates, assignments);
    const trustworthiness = computeTrustworthiness(matrix, projection.coordinates);
    const silhouetteQuality = metrics.silhouetteScore === null ? null : (metrics.silhouetteScore + 1) / 2;
    const score = silhouetteQuality === null ? trustworthiness ?? 0 : (silhouetteQuality + (trustworthiness ?? 0)) / 2;
    return {
      ...candidate,
      score,
      silhouetteScore: metrics.silhouetteScore,
      trustworthiness,
      clusterCounts: metrics.clusterCounts,
      noiseCount: metrics.noiseCount,
      noiseRate: assignments.length ? metrics.noiseCount / assignments.length : 0,
    };
  }).sort((a, b) => b.score - a.score);
  reportProgress(100);
  return {
    objective: 'balanced silhouette quality and neighborhood trustworthiness',
    candidatesEvaluated: results.length,
    rowLimit: 200,
    best: results[0],
    rankedCandidates: results,
  };
}
