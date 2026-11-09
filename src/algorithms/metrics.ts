/**
 * Evaluation Metrics: Silhouette Score and Adjusted Rand Index (ARI).
 */
import { DataValue } from '../types';

export function computeSilhouetteScore(data: number[][], labels: number[]): number | null {
  if (data.length <= 1 || labels.length !== data.length) return null;

  const clusters = new Map<number, number[]>();
  let clusteredPoints = 0;
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (label < 0) continue; // Exclude noise.
    if (!clusters.has(label)) clusters.set(label, []);
    clusters.get(label)!.push(i);
    clusteredPoints++;
  }

  if (clusters.size < 2 || clusters.size === clusteredPoints) return null;

  const dimension = data[0].length;
  const distanceSum = (i: number, neighbors: number[]) => {
    let sum = 0;
    for (const j of neighbors) {
      if (i === j) continue;
      let squared = 0;
      for (let k = 0; k < dimension; k++) {
        const difference = data[i][k] - data[j][k];
        squared += difference * difference;
      }
      sum += Math.sqrt(squared);
    }
    return sum;
  };

  let total = 0;
  for (const [label, members] of clusters) {
    if (members.length === 1) continue; // This point contributes zero to the mean.
    for (const i of members) {
      const a = distanceSum(i, members) / (members.length - 1);
      let b = Infinity;
      for (const [otherLabel, neighbors] of clusters) {
        if (label !== otherLabel) b = Math.min(b, distanceSum(i, neighbors) / neighbors.length);
      }
      const scale = Math.max(a, b);
      if (!Number.isFinite(scale)) return null;
      if (scale > 0) total += (b - a) / scale;
    }
  }
  return total / clusteredPoints;
}

/** An empty assignment list represents a projection without clustering. */
export function summarizeClustering(data: number[][], assignments: number[], groundTruth: DataValue[] = []) {
  const clusterCounts: Record<number, number> = {};
  let noiseCount = 0;
  for (const cluster of assignments) {
    if (cluster === -1) noiseCount++;
    else if (cluster >= 0) clusterCounts[cluster] = (clusterCounts[cluster] ?? 0) + 1;
  }
  return {
    clusterCounts,
    noiseCount,
    silhouetteScore: computeSilhouetteScore(data, assignments),
    adjustedRandIndex: computeARI(groundTruth, assignments),
  };
}

export function computeARI(
  groundTruth: DataValue[],
  predicted: number[]
): number | null {
  if (predicted.length !== groundTruth.length) return null;
  const rows = new Map<DataValue, number>();
  const columns = new Map<number, number>();
  const cells = new Map<DataValue, Map<number, number>>();
  // Adding an observation forms one pair with each existing member.
  function addPairCount<Key>(counts: Map<Key, number>, key: Key) {
    const previous = counts.get(key) ?? 0;
    counts.set(key, previous + 1);
    return previous;
  }
  let n = 0;
  let sumNij = 0;
  let sumAi = 0;
  let sumBj = 0;
  for (let i = 0; i < groundTruth.length; i++) {
    const actual = groundTruth[i];
    if (actual === null || actual === '') continue;
    const cluster = predicted[i];
    let row = cells.get(actual);
    if (!row) { row = new Map(); cells.set(actual, row); }
    sumNij += addPairCount(row, cluster);
    sumAi += addPairCount(rows, actual);
    sumBj += addPairCount(columns, cluster);
    n++;
  }
  if (n < 2) return null;
  const totalComb = n * (n - 1) / 2;
  const expectedIndex = (sumAi * sumBj) / totalComb;
  const maxIndex = (sumAi + sumBj) / 2;
  const denominator = maxIndex - expectedIndex;

  if (denominator === 0) return 1.0;

  const ari = (sumNij - expectedIndex) / denominator;
  return Math.max(-1, Math.min(1, ari));
}


/**
 * Phát hiện điểm ngoại lai (Outliers) trong không gian 3D dựa trên khoảng cách Euclidean tới tâm (Z-score > threshold).
 * Áp dụng cho PCA, t-SNE, UMAP, K-Means hoặc toàn bộ tập điểm.
 */
export function detectOutliers3D(
  points: { x: number; y: number; z: number }[],
  zThreshold: number = 2.5
): boolean[] {
  const n = points.length;
  if (n < 4) return new Array(n).fill(false);

  let sumX = 0, sumY = 0, sumZ = 0;
  for (let i = 0; i < n; i++) {
    sumX += points[i].x;
    sumY += points[i].y;
    sumZ += points[i].z;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  const meanZ = sumZ / n;

  const distances = new Float64Array(n);
  let sumDist = 0;
  for (let i = 0; i < n; i++) {
    const dx = points[i].x - meanX;
    const dy = points[i].y - meanY;
    const dz = points[i].z - meanZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    distances[i] = dist;
    sumDist += dist;
  }
  const meanDist = sumDist / n;

  let varDist = 0;
  for (let i = 0; i < n; i++) {
    const diff = distances[i] - meanDist;
    varDist += diff * diff;
  }
  const stdDist = Math.sqrt(varDist / (n - 1)) || 1e-6;

  const isOutlier = new Array<boolean>(n);
  for (let i = 0; i < n; i++) {
    isOutlier[i] = (distances[i] - meanDist) / stdDist > zThreshold;
  }
  return isOutlier;
}


/**
 * Phát hiện điểm ngoại lai chuyên biệt cho K-Means:
 * Điểm có khoảng cách Euclidean tới Centroid của cụm đó vượt ngưỡng Z-score (mặc định 2.5)
 */
export function detectKMeansOutliers(
  points: { x: number; y: number; z: number }[],
  clusters: number[],
  centroids: number[][],
  zThreshold: number = 2.5
): boolean[] {
  const n = points.length;
  if (n === 0) return [];
  if (centroids.length === 0) return detectOutliers3D(points, zThreshold);

  const clusterDists: Map<number, { indices: number[]; dists: number[] }> = new Map();
  for (let i = 0; i < n; i++) {
    const c = clusters[i] ?? 0;
    if (!clusterDists.has(c)) {
      clusterDists.set(c, { indices: [], dists: [] });
    }
    const centroid = centroids[c] || [0, 0, 0];
    const dx = points[i].x - (centroid[0] || 0);
    const dy = points[i].y - (centroid[1] || 0);
    const dz = points[i].z - (centroid[2] || 0);
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    clusterDists.get(c)!.indices.push(i);
    clusterDists.get(c)!.dists.push(d);
  }

  const isOutlier = new Array<boolean>(n).fill(false);
  clusterDists.forEach(({ indices, dists }) => {
    const kCount = dists.length;
    if (kCount < 4) return;
    const mean = dists.reduce((a, b) => a + b, 0) / kCount;
    const variance = dists.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (kCount - 1);
    const std = Math.sqrt(variance) || 1e-6;

    for (let j = 0; j < kCount; j++) {
      if ((dists[j] - mean) / std > zThreshold) {
        isOutlier[indices[j]] = true;
      }
    }
  });

  return isOutlier;
}
