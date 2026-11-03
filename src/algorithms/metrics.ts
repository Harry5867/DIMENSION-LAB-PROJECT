/**
 * Evaluation Metrics: Silhouette Score and Adjusted Rand Index (ARI).
 */
import { DataValue } from '../types';

export function computeSilhouetteScore(
  data: number[][],
  labels: number[]
): number | null {
  const n = data.length;
  if (n <= 1) return null;

  const d = data[0].length;

  // Group indices by cluster (ignore noise -1)
  const clusterMap = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const c = labels[i];
    if (c >= 0) {
      if (!clusterMap.has(c)) clusterMap.set(c, []);
      clusterMap.get(c)!.push(i);
    }
  }

  // Must have at least 2 distinct clusters
  if (clusterMap.size < 2) return null;

  let totalSilhouette = 0;
  let validPoints = 0;

  for (let i = 0; i < n; i++) {
    const c = labels[i];
    if (c < 0) continue; // Skip noise

    const sameCluster = clusterMap.get(c)!;
    if (sameCluster.length <= 1) continue;

    // Calculate a(i): mean intra-cluster distance
    let aSum = 0;
    for (const j of sameCluster) {
      if (i === j) continue;
      let dist = 0;
      for (let k = 0; k < d; k++) {
        const diff = data[i][k] - data[j][k];
        dist += diff * diff;
      }
      aSum += Math.sqrt(dist);
    }
    const a = aSum / (sameCluster.length - 1);

    // Calculate b(i): minimum mean distance to another cluster
    let b = Infinity;
    clusterMap.forEach((otherIndices, otherC) => {
      if (otherC === c || otherIndices.length === 0) return;
      let bSum = 0;
      for (const j of otherIndices) {
        let dist = 0;
        for (let k = 0; k < d; k++) {
          const diff = data[i][k] - data[j][k];
          dist += diff * diff;
        }
        bSum += Math.sqrt(dist);
      }
      const meanB = bSum / otherIndices.length;
      if (meanB < b) b = meanB;
    });

    if (b === Infinity) continue;

    const s = (b - a) / Math.max(a, b);
    totalSilhouette += s;
    validPoints++;
  }

  return validPoints > 0 ? totalSilhouette / validPoints : null;
}

export function computeARI(
  groundTruth: DataValue[],
  predicted: number[]
): number | null {
  const n = groundTruth.length;
  if (n <= 1 || predicted.length !== n) return null;

  // Contingency table: n_ij
  const rowLabels = Array.from(new Set(groundTruth));
  const colLabels = Array.from(new Set(predicted));

  if (rowLabels.length <= 1 || colLabels.length <= 1) return 0;

  const rowMap = new Map<DataValue, number>();
  rowLabels.forEach((lbl, idx) => rowMap.set(lbl, idx));

  const colMap = new Map<number, number>();
  colLabels.forEach((lbl, idx) => colMap.set(lbl, idx));

  const table: number[][] = Array.from({ length: rowLabels.length }, () =>
    new Array(colLabels.length).fill(0)
  );

  for (let i = 0; i < n; i++) {
    const r = rowMap.get(groundTruth[i])!;
    const c = colMap.get(predicted[i])!;
    table[r][c]++;
  }

  // Helper: n choose 2
  const comb2 = (val: number) => (val * (val - 1)) / 2;

  let sumNij = 0;
  for (let r = 0; r < rowLabels.length; r++) {
    for (let c = 0; c < colLabels.length; c++) {
      sumNij += comb2(table[r][c]);
    }
  }

  // Row sums: a_i
  let sumAi = 0;
  for (let r = 0; r < rowLabels.length; r++) {
    let a_i = 0;
    for (let c = 0; c < colLabels.length; c++) a_i += table[r][c];
    sumAi += comb2(a_i);
  }

  // Col sums: b_j
  let sumBj = 0;
  for (let c = 0; c < colLabels.length; c++) {
    let b_j = 0;
    for (let r = 0; r < rowLabels.length; r++) b_j += table[r][c];
    sumBj += comb2(b_j);
  }

  const totalComb = comb2(n);
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
