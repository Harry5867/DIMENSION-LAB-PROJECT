/**
 * DBSCAN (Density-Based Spatial Clustering of Applications with Noise)
 */

export interface DBSCANResult {
  clusters: number[]; // -1 for noise/outlier, >= 0 for cluster index
  numClusters: number;
  noiseCount: number;
}

export function computeDBSCAN(
  data: number[][],
  epsilon: number,
  minPts: number
): DBSCANResult {
  const n = data.length;
  if (n === 0) {
    return { clusters: [], numClusters: 0, noiseCount: 0 };
  }

  const d = data[0].length;
  const epsSq = epsilon * epsilon;

  const clusters = new Int32Array(n).fill(-2); // -2: unvisited
  let clusterId = 0;

  // Helper to find neighbors within epsilon
  const getNeighbors = (pointIdx: number): number[] => {
    const p = data[pointIdx];
    const neighbors: number[] = [];
    for (let i = 0; i < n; i++) {
      let d2 = 0;
      for (let j = 0; j < d; j++) {
        const diff = p[j] - data[i][j];
        d2 += diff * diff;
        if (d2 > epsSq) break;
      }
      if (d2 <= epsSq) {
        neighbors.push(i);
      }
    }
    return neighbors;
  };

  for (let i = 0; i < n; i++) {
    if (clusters[i] !== -2) continue; // Already processed

    const neighbors = getNeighbors(i);

    if (neighbors.length < minPts) {
      clusters[i] = -1; // Mark as noise (may become border point later)
    } else {
      clusters[i] = clusterId;

      // Expand cluster
      const queue = [...neighbors];
      let head = 0;

      while (head < queue.length) {
        const curr = queue[head++];

        if (clusters[curr] === -1) {
          clusters[curr] = clusterId; // Border point
        }

        if (clusters[curr] !== -2) continue; // Already visited

        clusters[curr] = clusterId;
        const currNeighbors = getNeighbors(curr);
        if (currNeighbors.length >= minPts) {
          for (const nb of currNeighbors) {
            if (clusters[nb] === -2 || clusters[nb] === -1) {
              queue.push(nb);
            }
          }
        }
      }

      clusterId++;
    }
  }

  let noiseCount = 0;
  for (let i = 0; i < n; i++) {
    if (clusters[i] === -1) noiseCount++;
  }

  return {
    clusters: Array.from(clusters),
    numClusters: clusterId,
    noiseCount,
  };
}
