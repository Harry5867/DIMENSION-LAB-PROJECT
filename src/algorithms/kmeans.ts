/**
 * K-Means Clustering with K-Means++ initialization.
 */

import { clusterCountError } from './unsupervised';

export interface KMeansResult {
  clusters: number[]; // Cluster ID for each point (0 to k-1)
  centroids: number[][]; // Centroid coordinates
  iterations: number;
  inertia: number; // WCSS: Within-Cluster Sum of Squares
}

export function computeKMeans(
  data: number[][],
  k: number,
  maxIterations: number = 50
): KMeansResult {
  const n = data.length;
  if (n === 0) {
    return { clusters: [], centroids: [], iterations: 0, inertia: 0 };
  }

  const error = clusterCountError('K-Means', k, n);
  if (error) throw new RangeError(error);
  const d = data[0].length;

  // 1. K-Means++ Initialization
  const centroids: number[][] = [];
  // Pick first centroid uniformly at random
  const firstIdx = Math.floor(Math.random() * n);
  centroids.push([...data[firstIdx]]);

  const minDistSq = new Float64Array(n).fill(Infinity);

  for (let c = 1; c < k; c++) {
    const prevCentroid = centroids[c - 1];
    let sumDist = 0;

    for (let i = 0; i < n; i++) {
      let d2 = 0;
      for (let j = 0; j < d; j++) {
        const diff = data[i][j] - prevCentroid[j];
        d2 += diff * diff;
      }
      if (d2 < minDistSq[i]) {
        minDistSq[i] = d2;
      }
      sumDist += minDistSq[i];
    }

    // Roulette-wheel selection proportional to D(x)^2
    let rand = Math.random() * sumDist;
    let chosenIdx = 0;
    for (let i = 0; i < n; i++) {
      rand -= minDistSq[i];
      if (rand <= 0) {
        chosenIdx = i;
        break;
      }
    }
    centroids.push([...data[chosenIdx]]);
  }

  // 2. Iteration: Expectation-Maximization
  let clusters = new Int32Array(n).fill(-1);
  let iter = 0;

  for (iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    // Assignment step
    for (let i = 0; i < n; i++) {
      let closestCluster = 0;
      let minD2 = Infinity;

      for (let c = 0; c < k; c++) {
        let d2 = 0;
        for (let j = 0; j < d; j++) {
          const diff = data[i][j] - centroids[c][j];
          d2 += diff * diff;
        }
        if (d2 < minD2) {
          minD2 = d2;
          closestCluster = c;
        }
      }

      if (clusters[i] !== closestCluster) {
        clusters[i] = closestCluster;
        changed = true;
      }
    }

    if (!changed && iter > 0) break;

    // Update step: Recalculate centroids
    const clusterSizes = new Int32Array(k);
    const newCentroids = Array.from({ length: k }, () => new Float64Array(d));

    for (let i = 0; i < n; i++) {
      const c = clusters[i];
      clusterSizes[c]++;
      for (let j = 0; j < d; j++) {
        newCentroids[c][j] += data[i][j];
      }
    }

    for (let c = 0; c < k; c++) {
      const size = clusterSizes[c];
      if (size > 0) {
        for (let j = 0; j < d; j++) {
          centroids[c][j] = newCentroids[c][j] / size;
        }
      }
    }
  }

  // Calculate inertia (WCSS: Within-Cluster Sum of Squares)
  let inertia = 0;
  for (let i = 0; i < n; i++) {
    const c = clusters[i];
    if (c >= 0 && c < k) {
      for (let j = 0; j < d; j++) {
        const diff = data[i][j] - centroids[c][j];
        inertia += diff * diff;
      }
    }
  }

  return {
    clusters: Array.from(clusters),
    centroids,
    iterations: iter,
    inertia,
  };
}
