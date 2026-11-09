/**
 * Uniform Manifold Approximation and Projection (UMAP) in 3D
 * Pure TypeScript implementation capturing local & global topological structure.
 */

export interface UMAPConfig {
  nNeighbors: number;
  minDist: number;
  nEpochs?: number;
}

export function computeUMAP(
  matrix: number[][],
  config: UMAPConfig,
  onProgress?: (epoch: number, total: number) => void
): [number, number, number][] {
  const n = matrix.length;
  if (n === 0) return [];
  if (n <= 3) {
    return matrix.map(row => [row[0] || 0, row[1] || 0, row[2] || 0]);
  }

  const d = matrix[0].length;
  const k = Math.min(config.nNeighbors || 15, n - 1);
  const minDist = config.minDist ?? 0.1;
  const nEpochs = Math.min(config.nEpochs || 200, 400);

  // Curve fitting constants for UMAP embedding distance
  // psi(d) = 1 / (1 + a * d^(2b))
  const a = 1.57694346 / (1 + minDist);
  const b = 0.89506083;

  // 1. Compute Pairwise Euclidean Distances
  const distMatrix: Float64Array = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let sum = 0;
      for (let m = 0; m < d; m++) {
        const diff = matrix[i][m] - matrix[j][m];
        sum += diff * diff;
      }
      const dist = Math.sqrt(sum);
      distMatrix[i * n + j] = dist;
      distMatrix[j * n + i] = dist;
    }
  }

  // 2. Find k-nearest neighbors and local connectivity rho
  interface Edge {
    source: number;
    target: number;
    weight: number;
  }
  const rawEdges: Edge[] = [];

  for (let i = 0; i < n; i++) {
    // Sort neighbors by distance
    const neighbors: { idx: number; dist: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        neighbors.push({ idx: j, dist: distMatrix[i * n + j] });
      }
    }
    neighbors.sort((a, b) => a.dist - b.dist);
    const kNeighbors = neighbors.slice(0, k);

    const rho = kNeighbors[0].dist; // Distance to nearest neighbor
    // Binary search for sigma
    let sigma = 1.0;
    let lo = 0;
    let hi = 1000;
    const targetVal = Math.log2(k);

    for (let iter = 0; iter < 30; iter++) {
      let pSum = 0;
      for (const nb of kNeighbors) {
        const dMinusRho = Math.max(0, nb.dist - rho);
        pSum += Math.exp(-dMinusRho / sigma);
      }
      if (Math.abs(pSum - targetVal) < 1e-4) break;
      if (pSum > targetVal) {
        hi = sigma;
        sigma = (lo + hi) / 2;
      } else {
        lo = sigma;
        sigma = hi === 1000 ? sigma * 2 : (lo + hi) / 2;
      }
    }

    for (const nb of kNeighbors) {
      const dMinusRho = Math.max(0, nb.dist - rho);
      const weight = Math.exp(-dMinusRho / Math.max(sigma, 1e-6));
      rawEdges.push({ source: i, target: nb.idx, weight });
    }
  }

  // 3. Fuzzy Set Union (Symmetrize weights: w_sym = w1 + w2 - w1 * w2)
  const edgeMap = new Map<string, number>();
  for (const edge of rawEdges) {
    const key = `${Math.min(edge.source, edge.target)}-${Math.max(edge.source, edge.target)}`;
    const existing = edgeMap.get(key) || 0;
    const combined = existing + edge.weight - existing * edge.weight;
    edgeMap.set(key, combined);
  }

  const edges: Edge[] = [];
  edgeMap.forEach((weight, key) => {
    if (weight > 1e-4) {
      const [s, t] = key.split('-').map(Number);
      edges.push({ source: s, target: t, weight });
    }
  });

  // 4. Initialize 3D embedding coordinates (Random jitter)
  const Y = new Float64Array(n * 3);
  for (let i = 0; i < n * 3; i++) {
    Y[i] = (Math.random() - 0.5) * 10;
  }

  // 5. Stochastic Gradient Descent (SGD)
  let alpha = 1.0; // Initial learning rate

  for (let epoch = 0; epoch < nEpochs; epoch++) {
    alpha = 1.0 * (1.0 - epoch / nEpochs);

    // Attractive forces along edges
    for (const edge of edges) {
      const i3 = edge.source * 3;
      const j3 = edge.target * 3;

      const dx = Y[i3] - Y[j3];
      const dy = Y[i3 + 1] - Y[j3 + 1];
      const dz = Y[i3 + 2] - Y[j3 + 2];
      const d2 = dx * dx + dy * dy + dz * dz;

      if (d2 > 0) {
        const gradCoeff = (-2.0 * a * b * Math.pow(d2, b - 1)) / (1.0 + a * Math.pow(d2, b));
        const force = gradCoeff * edge.weight * alpha;

        Y[i3] += Math.max(-4, Math.min(4, force * dx));
        Y[i3 + 1] += Math.max(-4, Math.min(4, force * dy));
        Y[i3 + 2] += Math.max(-4, Math.min(4, force * dz));

        Y[j3] -= Math.max(-4, Math.min(4, force * dx));
        Y[j3 + 1] -= Math.max(-4, Math.min(4, force * dy));
        Y[j3 + 2] -= Math.max(-4, Math.min(4, force * dz));
      }

      // Repulsive forces (Negative Sampling)
      for (let rep = 0; rep < 3; rep++) {
        const randTarget = Math.floor(Math.random() * n);
        if (randTarget === edge.source) continue;
        const r3 = randTarget * 3;

        const rdx = Y[i3] - Y[r3];
        const rdy = Y[i3 + 1] - Y[r3 + 1];
        const rdz = Y[i3 + 2] - Y[r3 + 2];
        const rd2 = rdx * rdx + rdy * rdy + rdz * rdz;

        if (rd2 > 0) {
          const repCoeff = (2.0 * b) / ((0.001 + rd2) * (1.0 + a * Math.pow(rd2, b)));
          const repForce = repCoeff * alpha;

          Y[i3] += Math.max(-4, Math.min(4, repForce * rdx));
          Y[i3 + 1] += Math.max(-4, Math.min(4, repForce * rdy));
          Y[i3 + 2] += Math.max(-4, Math.min(4, repForce * rdz));
        }
      }
    }

    if (onProgress && epoch % 20 === 0) {
      onProgress(epoch, nEpochs);
    }
  }

  // Format result as [x, y, z]
  const result: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    result.push([Y[i * 3], Y[i * 3 + 1], Y[i * 3 + 2]]);
  }

  return result;
}
